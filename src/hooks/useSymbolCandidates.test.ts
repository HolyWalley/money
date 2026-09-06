import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSymbolCandidates } from './useSymbolCandidates'
import { CLOSE_LOOKBACK_DAYS } from '../../shared/market-data'
import type { Instrument } from '../../shared/schemas/instrument.schema'

const mocks = vi.hoisted(() => ({
  searchSymbols: vi.fn(),
  getCloses: vi.fn(),
}))

vi.mock('@/lib/market-data-client', () => ({
  searchSymbols: mocks.searchSymbols,
  marketDataClient: { getCloses: mocks.getCloses },
}))

const TRADE_DATE = '2026-03-12'

// Both listings of one real ISIN: the London line is quoted in USD, the Xetra
// one in EUR, and only the price paid tells them apart.
const LONDON = { symbol: 'FLXI.L', name: 'Franklin FTSE India UCITS ETF', currency: 'USD', exchange: 'LSE' }
const XETRA = { symbol: 'FWIA.DE', name: 'Franklin FTSE India UCITS ETF', currency: 'EUR', exchange: 'XETRA' }

function makeInstrument(overrides: Partial<Instrument> = {}): Instrument {
  return {
    _id: 'i-india',
    type: 'instrument',
    isin: 'IE00BHZRQZ17',
    name: 'Franklin FTSE India UCITS ETF',
    currency: 'EUR',
    kind: 'etf',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function closesOn(date: string, bySymbol: Record<string, number>) {
  const closes = new Map<string, number>()
  for (const [symbol, close] of Object.entries(bySymbol)) {
    closes.set(`${symbol}:${date}`, close)
  }
  return { closes, currencies: new Map<string, string>() }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Longer than the hook's debounce, so a query that never fires has had its chance. */
const PAST_THE_DEBOUNCE_MS = 400

const searchedFor = () => mocks.searchSymbols.mock.calls.map(([query]) => query)

describe('useSymbolCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.searchSymbols.mockResolvedValue([])
    mocks.getCloses.mockResolvedValue(closesOn(TRADE_DATE, {}))
  })

  it('puts the listing whose close matches the executed price first', async () => {
    mocks.searchSymbols.mockResolvedValue([LONDON, XETRA])
    mocks.getCloses.mockResolvedValue(closesOn(TRADE_DATE, { 'FLXI.L': 55.4, 'FWIA.DE': 48.3 }))

    const { result } = renderHook(() =>
      useSymbolCandidates({ instrument: makeInstrument(), reference: { price: 48.12, date: TRADE_DATE } })
    )

    await waitFor(() => expect(result.current.isRanked).toBe(true))

    expect(result.current.candidates.map(candidate => candidate.symbol)).toEqual(['FWIA.DE', 'FLXI.L'])
    expect(result.current.candidates[0].matches).toBe(true)
    expect(result.current.candidates[0].close).toBe(48.3)
    // The London line is out by a whole FX rate, which is exactly what the
    // ranking exists to catch.
    expect(result.current.candidates[1].matches).toBe(false)
  })

  // A trade dated on a market holiday has no close of its own, and a candidate
  // dropped for want of one would read as unpriceable.
  it('prices a candidate from the session before when the trade date has no close', async () => {
    mocks.searchSymbols.mockResolvedValue([XETRA])
    mocks.getCloses.mockResolvedValue(closesOn('2026-03-11', { 'FWIA.DE': 48.3 }))

    const { result } = renderHook(() =>
      useSymbolCandidates({ instrument: makeInstrument(), reference: { price: 48.12, date: TRADE_DATE } })
    )

    await waitFor(() => expect(result.current.isRanked).toBe(true))

    expect(result.current.candidates[0].close).toBe(48.3)
    expect(result.current.candidates[0].matches).toBe(true)

    const [, from, to] = mocks.getCloses.mock.calls[0]
    const daysRequested = Math.round((to.getTime() - from.getTime()) / 86_400_000)
    expect(daysRequested).toBe(CLOSE_LOOKBACK_DAYS)
  })

  it('searches the ISIN, which names the security across every listing', async () => {
    renderHook(() => useSymbolCandidates({ instrument: makeInstrument() }))

    await waitFor(() => expect(searchedFor()).toEqual(['IE00BHZRQZ17']))
  })

  it('falls back to the ticker when the statement gave no ISIN', async () => {
    renderHook(() => useSymbolCandidates({ instrument: makeInstrument({ isin: undefined, ticker: 'NVDA' }) }))

    await waitFor(() => expect(searchedFor()).toEqual(['NVDA']))
  })

  it('leaves the candidates unranked when there is no trade to compare against', async () => {
    mocks.searchSymbols.mockResolvedValue([LONDON, XETRA])

    const { result } = renderHook(() => useSymbolCandidates({ instrument: makeInstrument() }))

    await waitFor(() => expect(result.current.candidates).toHaveLength(2))

    expect(result.current.isRanked).toBe(false)
    expect(result.current.candidates.map(candidate => candidate.symbol)).toEqual(['FLXI.L', 'FWIA.DE'])
    expect(result.current.candidates.every(candidate => candidate.close === null)).toBe(true)
    expect(result.current.candidates.every(candidate => !candidate.matches)).toBe(true)
    expect(mocks.getCloses).not.toHaveBeenCalled()
    expect(result.current.isLoading).toBe(false)
  })

  it('still lists the candidates when their closes cannot be fetched', async () => {
    mocks.searchSymbols.mockResolvedValue([LONDON, XETRA])
    mocks.getCloses.mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() =>
      useSymbolCandidates({ instrument: makeInstrument(), reference: { price: 48.12, date: TRADE_DATE } })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.candidates).toHaveLength(2)
    expect(result.current.candidates.every(candidate => candidate.close === null)).toBe(true)
    // Nothing was compared, so nothing about this order is evidence.
    expect(result.current.isRanked).toBe(false)
  })

  it('reports a failed search rather than passing it off as no matches', async () => {
    mocks.searchSymbols.mockRejectedValue(new Error('unreachable'))

    const { result } = renderHook(() => useSymbolCandidates({ instrument: makeInstrument() }))

    await waitFor(() => expect(result.current.error).not.toBeNull())

    expect(result.current.candidates).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  it('asks again, and clears the error, when the failed search is retried', async () => {
    mocks.searchSymbols.mockRejectedValueOnce(new Error('unreachable'))
    mocks.searchSymbols.mockResolvedValue([XETRA])

    const { result } = renderHook(() => useSymbolCandidates({ instrument: makeInstrument() }))
    await waitFor(() => expect(result.current.error).not.toBeNull())

    act(() => result.current.retry())

    await waitFor(() => expect(result.current.candidates).toHaveLength(1))
    expect(result.current.error).toBeNull()
  })

  it('sends one search for a query being typed, not one per keystroke', async () => {
    const { result } = renderHook(() => useSymbolCandidates({ instrument: makeInstrument() }))
    await waitFor(() => expect(searchedFor()).toEqual(['IE00BHZRQZ17']))

    act(() => result.current.setQuery('IND'))
    act(() => result.current.setQuery('INDI'))
    act(() => result.current.setQuery('INDIA'))

    await waitFor(() => expect(searchedFor()).toEqual(['IE00BHZRQZ17', 'INDIA']))
  })

  it('does not spend a request on a query the server would reject as too short', async () => {
    const { result } = renderHook(() => useSymbolCandidates({ instrument: makeInstrument() }))
    await waitFor(() => expect(mocks.searchSymbols).toHaveBeenCalledTimes(1))

    act(() => result.current.setQuery('F'))
    await act(async () => {
      await sleep(PAST_THE_DEBOUNCE_MS)
    })

    expect(mocks.searchSymbols).toHaveBeenCalledTimes(1)
  })

  it('searches nothing while the picker is closed', async () => {
    renderHook(() => useSymbolCandidates({ instrument: makeInstrument(), enabled: false }))

    await act(async () => {
      await sleep(PAST_THE_DEBOUNCE_MS)
    })

    expect(mocks.searchSymbols).not.toHaveBeenCalled()
  })

  // The reference object and the results array are rebuilt on every render;
  // an effect keyed on either would fetch until the tab is closed.
  it('does not refetch when the caller re-renders with the same instrument', async () => {
    mocks.searchSymbols.mockResolvedValue([LONDON, XETRA])
    mocks.getCloses.mockResolvedValue(closesOn(TRADE_DATE, { 'FLXI.L': 55.4, 'FWIA.DE': 48.3 }))

    const { result, rerender } = renderHook(() =>
      useSymbolCandidates({ instrument: makeInstrument(), reference: { price: 48.12, date: TRADE_DATE } })
    )
    await waitFor(() => expect(result.current.isRanked).toBe(true))

    rerender()
    rerender()
    await act(async () => {
      await sleep(PAST_THE_DEBOUNCE_MS)
    })

    expect(mocks.searchSymbols).toHaveBeenCalledTimes(1)
    expect(mocks.getCloses).toHaveBeenCalledTimes(1)
  })
})
