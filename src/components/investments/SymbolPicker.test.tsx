import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SymbolPicker } from './SymbolPicker'
import type { Instrument } from '../../../shared/schemas/instrument.schema'

const mocks = vi.hoisted(() => ({
  searchSymbols: vi.fn(),
  getCloses: vi.fn(),
  updateInstrument: vi.fn(),
}))

vi.mock('@/lib/market-data-client', () => ({
  searchSymbols: mocks.searchSymbols,
  marketDataClient: { getCloses: mocks.getCloses },
}))

vi.mock('@/services/investmentService', () => ({
  investmentService: { updateInstrument: mocks.updateInstrument },
}))

const TRADE_DATE = '2026-03-12'

// Both listings of one real ISIN: the London line is quoted in USD, the Xetra
// one in EUR, and only the price paid tells them apart.
const LONDON = { symbol: 'FLXI.L', name: 'Franklin FTSE India UCITS ETF', currency: 'USD', exchange: 'LSE' }
const XETRA = { symbol: 'FWIA.DE', name: 'Franklin FTSE India UCITS ETF', currency: 'EUR', exchange: 'XETRA' }

const INSTRUMENT: Instrument = {
  _id: 'i-india',
  type: 'instrument',
  isin: 'IE00BHZRQZ17',
  name: 'Franklin FTSE India UCITS ETF',
  currency: 'EUR',
  kind: 'etf',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function closesOn(date: string, bySymbol: Record<string, number>) {
  const closes = new Map<string, number>()
  for (const [symbol, close] of Object.entries(bySymbol)) {
    closes.set(`${symbol}:${date}`, close)
  }
  return { closes, currencies: new Map<string, string>() }
}

function renderPicker(overrides: Partial<React.ComponentProps<typeof SymbolPicker>> = {}) {
  const onResolve = vi.fn()
  const onOpenChange = vi.fn()

  const props = {
    instrument: INSTRUMENT,
    open: true,
    onOpenChange,
    onResolve,
    reference: { price: 48.12, date: TRADE_DATE },
    ...overrides,
  }

  const view = render(<SymbolPicker {...props} />)

  const reopen = () => {
    view.rerender(<SymbolPicker {...props} open={false} />)
    view.rerender(<SymbolPicker {...props} open />)
  }

  return { onResolve, onOpenChange, reopen }
}

describe('SymbolPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.searchSymbols.mockResolvedValue([LONDON, XETRA])
    mocks.getCloses.mockResolvedValue(closesOn(TRADE_DATE, { 'FLXI.L': 55.4, 'FWIA.DE': 48.3 }))
    mocks.updateInstrument.mockResolvedValue(undefined)

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  })

  it('puts the listing that agrees with the executed price first and says so', async () => {
    renderPicker()

    await screen.findByText('Matches what you paid')

    const listings = screen.getAllByRole('button', { name: /Franklin FTSE India/ })
    expect(listings[0]).toHaveAccessibleName(/FWIA\.DE/)
    expect(listings[0]).toHaveAccessibleName(/Matches what you paid/)
    expect(listings[1]).toHaveAccessibleName(/FLXI\.L/)
    expect(listings[1]).not.toHaveAccessibleName(/Matches what you paid/)
  })

  // Without this the recommendation is an assertion the user has to take on
  // trust, and a wrong listing misprices the holding for as long as it is held.
  it('shows the price being compared against, and each listing deviation from it', async () => {
    renderPicker()

    await screen.findByText('Matches what you paid')

    expect(screen.getByText(/48\.12 EUR/)).toBeInTheDocument()
    expect(screen.getByText(/Mar 12, 2026/)).toBeInTheDocument()
    expect(screen.getByText('0.4% off')).toBeInTheDocument()
    expect(screen.getByText('15.1% off')).toBeInTheDocument()
  })

  it('accepts the recommended listing in one tap and saves it', async () => {
    const user = userEvent.setup()
    const { onResolve, onOpenChange } = renderPicker()

    const accept = await screen.findByRole('button', { name: 'Use FWIA.DE' })
    await user.click(accept)

    await waitFor(() => expect(mocks.updateInstrument).toHaveBeenCalledWith('i-india', { symbol: 'FWIA.DE' }))
    expect(onResolve).toHaveBeenCalledWith('FWIA.DE')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  // The ranking is advice: a user who knows the statement can overrule it.
  it('lets a listing the ranking did not recommend be chosen anyway', async () => {
    const user = userEvent.setup()
    const { onResolve } = renderPicker()

    await screen.findByText('Matches what you paid')
    await user.click(screen.getByRole('button', { name: /FLXI\.L/ }))
    await user.click(screen.getByRole('button', { name: 'Use FLXI.L' }))

    await waitFor(() => expect(mocks.updateInstrument).toHaveBeenCalledWith('i-india', { symbol: 'FLXI.L' }))
    expect(onResolve).toHaveBeenCalledWith('FLXI.L')
  })

  // The closes arrive after the list does, and a recommendation that overwrote
  // a tap already made would save a listing nobody chose.
  it('keeps the listing the user tapped when the ranking lands afterwards', async () => {
    const user = userEvent.setup()
    let landCloses: (closes: ReturnType<typeof closesOn>) => void = () => {}
    mocks.getCloses.mockReturnValue(
      new Promise<ReturnType<typeof closesOn>>(resolve => {
        landCloses = resolve
      })
    )

    renderPicker()

    await user.click(await screen.findByRole('button', { name: /FLXI\.L/ }))
    await act(async () => {
      landCloses(closesOn(TRADE_DATE, { 'FLXI.L': 55.4, 'FWIA.DE': 48.3 }))
    })

    await screen.findByText('Matches what you paid')
    expect(screen.getByRole('button', { name: 'Use FLXI.L' })).toBeInTheDocument()
  })

  it('lists unranked results, and says they are unranked, when there is no trade to compare', async () => {
    const user = userEvent.setup()
    const { onResolve } = renderPicker({ reference: undefined })

    await screen.findByText(/No trade to compare a price against/)

    expect(screen.queryByText('Matches what you paid')).not.toBeInTheDocument()
    expect(mocks.getCloses).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /FWIA\.DE/ }))
    await user.click(screen.getByRole('button', { name: 'Use FWIA.DE' }))

    await waitFor(() => expect(mocks.updateInstrument).toHaveBeenCalledWith('i-india', { symbol: 'FWIA.DE' }))
    expect(onResolve).toHaveBeenCalledWith('FWIA.DE')
  })

  it('admits the order is not a comparison when no closes came back for that day', async () => {
    mocks.getCloses.mockResolvedValue(closesOn(TRADE_DATE, {}))
    renderPicker()

    expect(await screen.findByText(/No closes came back for that day/)).toBeInTheDocument()
    expect(screen.getAllByText('No close that day')).toHaveLength(2)
    expect(screen.queryByText('Matches what you paid')).not.toBeInTheDocument()
  })

  it('reports a failed search and searches again when asked', async () => {
    const user = userEvent.setup()
    mocks.searchSymbols.mockRejectedValueOnce(new Error('unreachable'))
    renderPicker()

    await screen.findByRole('alert')
    expect(screen.getByText(/Nothing was saved/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    await screen.findByText('Matches what you paid')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('says so when the search finds nothing', async () => {
    mocks.searchSymbols.mockResolvedValue([])
    renderPicker()

    expect(await screen.findByText(/No listing matched that search/)).toBeInTheDocument()
  })

  it('takes a symbol typed in directly, for a listing the search never surfaces', async () => {
    const user = userEvent.setup()
    mocks.searchSymbols.mockResolvedValue([])
    const { onResolve } = renderPicker()

    await screen.findByText(/No listing matched that search/)
    await user.type(screen.getByLabelText(/Enter the feed symbol/), 'fwia.de')
    await user.click(screen.getByRole('button', { name: 'Use' }))

    // Upper-cased: feeds quote symbols that way, and 'fwia.de' would never price.
    await waitFor(() => expect(mocks.updateInstrument).toHaveBeenCalledWith('i-india', { symbol: 'FWIA.DE' }))
    expect(onResolve).toHaveBeenCalledWith('FWIA.DE')
  })

  it('keeps the picker open and explains itself when the symbol cannot be saved', async () => {
    const user = userEvent.setup()
    mocks.updateInstrument.mockRejectedValue(new Error('Instrument not found'))
    const { onResolve, onOpenChange } = renderPicker()

    await user.click(await screen.findByRole('button', { name: 'Use FWIA.DE' }))

    expect(await screen.findByText('Instrument not found')).toBeInTheDocument()
    expect(onResolve).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  // A sub-unit share price is a real quote, and a 2-decimal money formatter
  // turns the one piece of evidence on the screen into "0.00".
  it('shows a sub-unit price paid, and a sub-unit close, at the precision that tells them apart', async () => {
    mocks.searchSymbols.mockResolvedValue([XETRA])
    mocks.getCloses.mockResolvedValue(closesOn(TRADE_DATE, { 'FWIA.DE': 0.0345 }))
    renderPicker({ reference: { price: 0.03444, date: TRADE_DATE } })

    await screen.findByText('Matches what you paid')

    expect(screen.getByText(/0\.03444 EUR/)).toBeInTheDocument()
    expect(screen.getByText(/0\.0345 EUR/)).toBeInTheDocument()
    expect(screen.queryByText(/0\.00 EUR/)).not.toBeInTheDocument()
  })

  it('does not bring back the failed save, or what was typed, when it is reopened', async () => {
    const user = userEvent.setup()
    mocks.updateInstrument.mockRejectedValue(new Error('Instrument not found'))
    const { reopen } = renderPicker()

    await user.type(await screen.findByLabelText(/Enter the feed symbol/), 'fwia.de')
    await user.click(screen.getByRole('button', { name: 'Use FWIA.DE' }))
    await screen.findByText('Instrument not found')

    reopen()

    await waitFor(() => expect(screen.queryByText('Instrument not found')).not.toBeInTheDocument())
    expect(screen.getByLabelText(/Enter the feed symbol/)).toHaveValue('')
  })

  it('searches nothing while it is closed', async () => {
    renderPicker({ open: false })

    await waitFor(() => expect(mocks.searchSymbols).not.toHaveBeenCalled())
  })
})
