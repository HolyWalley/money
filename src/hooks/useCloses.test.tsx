import { act, renderHook, screen, waitFor } from '@testing-library/react'
import { UTCDate } from '@date-fns/utc'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Suspended, deferred, mountSuspended } from '@/test/suspense'
import { useCloses } from './useCloses'
import { db } from '@/lib/db-dexie'
import { TIP_TTL_MS, marketDataClient, type PricesResponse } from '@/lib/market-data-client'
import { EMPTY_CLOSES, closesKey, parseClosesKey } from '@/lib/prices-resource'
import { resetResources } from '@/lib/suspense-resource'
import type { Deferred } from '@/lib/suspense'

const mocks = vi.hoisted(() => ({
  /** What the server answers, by symbol; only the symbols asked for come back. */
  prices: {} as PricesResponse,
  requests: [] as string[][],
  /** Set to hold the answer back, so a request still in flight can be observed. */
  pending: null as Deferred<PricesResponse> | null,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getPrices: async (symbols: string[]) => {
      mocks.requests.push(symbols)
      const prices = mocks.pending ? await mocks.pending.promise : mocks.prices
      const data: PricesResponse = {}
      for (const symbol of symbols) {
        if (prices[symbol]) data[symbol] = prices[symbol]
      }
      return { ok: true, status: 200, data }
    },
  },
  isRetryableFailure: () => true,
}))

const FROM = new UTCDate('2025-03-10T00:00:00Z')
const TO = new UTCDate('2025-03-14T00:00:00Z')

async function seed(rows: Array<{ symbol: string; date: string; close: number; fetchedAt?: number }>) {
  await db.instrumentPrices.bulkPut(
    rows.map(row => ({
      key: `${row.symbol}:${row.date}`,
      symbol: row.symbol,
      date: row.date,
      close: row.close,
      currency: 'EUR',
      fetchedAt: row.fetchedAt ?? Date.now(),
    }))
  )
}

function Closes({ symbolsKey, from, to }: { symbolsKey: string; from: Date | null; to: Date }) {
  const { closes } = useCloses(symbolsKey, from, to)
  return (
    <div data-testid="closes">
      {[...closes].map(([key, close]) => `${key}=${close}`).join(',')}
    </div>
  )
}

beforeEach(async () => {
  await db.instrumentPrices.clear()
  await db.priceFetches.clear()
  marketDataClient.resetForTests()
  resetResources()
  mocks.prices = {}
  mocks.requests = []
  mocks.pending = null
  // Only the clock: faking timers as well would stall Dexie's own plumbing.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new UTCDate('2025-03-14T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useCloses', () => {
  it('answers at once with nothing to price', () => {
    const { result } = renderHook(() => useCloses('', FROM, TO), { wrapper: Suspended })
    expect(result.current).toBe(EMPTY_CLOSES)

    const noStart = renderHook(() => useCloses('FWIA.DE', null, TO), { wrapper: Suspended })
    expect(noStart.result.current).toBe(EMPTY_CLOSES)

    expect(screen.queryByTestId('fallback')).toBeNull()
    expect(mocks.requests).toEqual([])
  })

  it('answers a settled range from the cache without asking the server', async () => {
    await seed([
      { symbol: 'FWIA.DE', date: '2025-03-10', close: 40.1 },
      { symbol: 'FWIA.DE', date: '2025-03-12', close: 40.9 },
    ])

    await mountSuspended(<Closes symbolsKey="FWIA.DE" from={FROM} to={new UTCDate('2025-03-12T00:00:00Z')} />)

    await screen.findByTestId('closes')
    expect(screen.getByTestId('closes')).toHaveTextContent('FWIA.DE:2025-03-10=40.1,FWIA.DE:2025-03-12=40.9')
    expect(mocks.requests).toEqual([])
  })

  it('suspends until the server answers when the cache has nothing', async () => {
    mocks.pending = deferred<PricesResponse>()

    await mountSuspended(<Closes symbolsKey="FWIA.DE" from={FROM} to={TO} />)

    await waitFor(() => expect(mocks.requests).toEqual([['FWIA.DE']]))
    expect(screen.getByTestId('fallback')).toBeInTheDocument()

    await act(async () => {
      mocks.pending?.resolve({ 'FWIA.DE': { currency: 'EUR', closes: { '2025-03-14': 41.9 } } })
    })

    await screen.findByTestId('closes')
    expect(screen.getByTestId('closes')).toHaveTextContent('FWIA.DE:2025-03-14=41.9')
  })

  it('shows an aged tip at once and replaces it when the refresh lands', async () => {
    await seed([
      { symbol: 'FWIA.DE', date: '2025-03-13', close: 41.4, fetchedAt: Date.now() - TIP_TTL_MS - 1 },
    ])
    mocks.pending = deferred<PricesResponse>()

    await mountSuspended(<Closes symbolsKey="FWIA.DE" from={new UTCDate('2025-03-13T00:00:00Z')} to={TO} />)

    await screen.findByTestId('closes')
    expect(screen.getByTestId('closes')).toHaveTextContent('FWIA.DE:2025-03-13=41.4')
    await waitFor(() => expect(mocks.requests).toEqual([['FWIA.DE']]))

    await act(async () => {
      mocks.pending?.resolve({ 'FWIA.DE': { currency: 'EUR', closes: { '2025-03-14': 41.9 } } })
    })

    // In place, and never smaller: the refresh is a union over what was shown.
    await waitFor(() =>
      expect(screen.getByTestId('closes')).toHaveTextContent('FWIA.DE:2025-03-13=41.4,FWIA.DE:2025-03-14=41.9')
    )
    expect(screen.queryByTestId('fallback')).toBeNull()
  })

  it('reads a symbol list once, however many readers share it', async () => {
    mocks.prices = { 'FWIA.DE': { currency: 'EUR', closes: { '2025-03-14': 41.9 } } }

    await mountSuspended(
      <>
        <Closes symbolsKey="FWIA.DE" from={FROM} to={TO} />
        <Closes symbolsKey="FWIA.DE" from={FROM} to={new UTCDate('2025-03-14T18:00:00Z')} />
      </>
    )

    await screen.findAllByTestId('closes')
    expect(mocks.requests).toEqual([['FWIA.DE']])
  })
})

describe('closesKey', () => {
  it('is on UTC days, so two instants of one day share an entry', () => {
    const morning = new UTCDate('2025-03-14T08:00:00Z')
    const evening = new UTCDate('2025-03-14T23:30:00Z')

    expect(closesKey('FWIA.DE,VUAA.DE', FROM, morning)).toBe('FWIA.DE,VUAA.DE|2025-03-10|2025-03-14')
    expect(closesKey('FWIA.DE,VUAA.DE', FROM, evening)).toBe(closesKey('FWIA.DE,VUAA.DE', FROM, morning))
  })

  it('reads back the symbols and the days it was made from', () => {
    const parsed = parseClosesKey(closesKey('FWIA.DE,VUAA.DE', FROM, TO))

    expect(parsed.symbols).toEqual(['FWIA.DE', 'VUAA.DE'])
    expect(parsed.from.toISOString()).toBe('2025-03-10T00:00:00.000Z')
    expect(parsed.to.toISOString()).toBe('2025-03-14T00:00:00.000Z')
  })
})
