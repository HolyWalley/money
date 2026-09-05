import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { UTCDate } from '@date-fns/utc'
import {
  MarketDataClient,
  RETRY_AFTER_FAILURE_MS,
  TIP_TTL_MS,
  searchSymbols,
  type PriceFetchOutcome,
  type PricesResponse,
} from './market-data-client'
import { db } from './db-dexie'
import { reportRequestOutcome, resetNetworkStatus } from './network-status'

const FROM = new UTCDate('2025-03-10T00:00:00Z')
const TO = new UTCDate('2025-03-14T00:00:00Z')

function respondWith(response: PricesResponse) {
  return vi.fn(async (): Promise<PriceFetchOutcome> => ({ ok: true, prices: response }))
}

/** A transport failure: nothing was answered, and the next render should retry. */
function failing() {
  return vi.fn(async (): Promise<PriceFetchOutcome> => ({ ok: false, retryable: true }))
}

/** A request the server understood and refused; sending it again changes nothing. */
function refusing() {
  return vi.fn(async (): Promise<PriceFetchOutcome> => ({ ok: false, retryable: false }))
}

async function seed(rows: Array<{ symbol: string; date: string; close: number; fetchedAt?: number }>) {
  await db.instrumentPrices.bulkPut(
    rows.map((row) => ({
      key: `${row.symbol}:${row.date}`,
      symbol: row.symbol,
      date: row.date,
      close: row.close,
      currency: 'EUR',
      fetchedAt: row.fetchedAt ?? Date.now(),
    }))
  )
}

beforeEach(async () => {
  await db.instrumentPrices.clear()
  // The client reasons about "today", so pin it rather than letting the range
  // under test drift into the past as the suite ages. Only the clock is faked:
  // faking timers as well would stall Dexie's own transaction plumbing.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new UTCDate('2025-03-14T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  resetNetworkStatus()
})

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('MarketDataClient', () => {
  it('fetches and caches when nothing is stored', async () => {
    const fetcher = respondWith({
      'FWIA.DE': { currency: 'EUR', closes: { '2025-03-13': 41.4, '2025-03-14': 41.9 } },
    })
    const client = new MarketDataClient(fetcher)

    const { closes, currencies } = await client.getCloses(['FWIA.DE'], FROM, TO)

    expect(fetcher).toHaveBeenCalledWith(['FWIA.DE'], '2025-03-10', '2025-03-14')
    expect(closes.get('FWIA.DE:2025-03-14')).toBe(41.9)
    expect(currencies.get('FWIA.DE')).toBe('EUR')
    expect(await db.instrumentPrices.count()).toBe(2)
  })

  it('serves a fully cached past range without touching the network', async () => {
    await seed([
      { symbol: 'FWIA.DE', date: '2025-03-10', close: 40.1 },
      { symbol: 'FWIA.DE', date: '2025-03-12', close: 40.9 },
    ])
    const fetcher = respondWith({})
    const client = new MarketDataClient(fetcher)

    const { closes } = await client.getCloses(['FWIA.DE'], FROM, new UTCDate('2025-03-12T00:00:00Z'))

    expect(fetcher).not.toHaveBeenCalled()
    expect(closes.size).toBe(2)
  })

  it('does not chase the tip again while the last answer is still fresh', async () => {
    await seed([{ symbol: 'FWIA.DE', date: '2025-03-13', close: 41.4, fetchedAt: Date.now() - 60_000 }])
    const fetcher = respondWith({})
    const client = new MarketDataClient(fetcher)

    await client.getCloses(['FWIA.DE'], new UTCDate('2025-03-13T00:00:00Z'), TO)

    expect(fetcher).not.toHaveBeenCalled()
  })

  it('chases the tip again once the answer has gone stale', async () => {
    await seed([
      { symbol: 'FWIA.DE', date: '2025-03-13', close: 41.4, fetchedAt: Date.now() - TIP_TTL_MS - 1 },
    ])
    const fetcher = respondWith({ 'FWIA.DE': { currency: 'EUR', closes: { '2025-03-14': 41.9 } } })
    const client = new MarketDataClient(fetcher)

    const { closes } = await client.getCloses(['FWIA.DE'], new UTCDate('2025-03-13T00:00:00Z'), TO)

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(closes.get('FWIA.DE:2025-03-14')).toBe(41.9)
  })

  it('backfills a range that reaches back before what is stored, however fresh it is', async () => {
    await seed([{ symbol: 'FWIA.DE', date: '2025-03-13', close: 41.4 }])
    const fetcher = respondWith({ 'FWIA.DE': { currency: 'EUR', closes: { '2025-03-10': 40.1 } } })
    const client = new MarketDataClient(fetcher)

    const { closes } = await client.getCloses(['FWIA.DE'], FROM, TO)

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(closes.get('FWIA.DE:2025-03-10')).toBe(40.1)
    expect(closes.get('FWIA.DE:2025-03-13')).toBe(41.4)
  })

  it('does not re-ask for a symbol the server could not price', async () => {
    const fetcher = respondWith({})
    const client = new MarketDataClient(fetcher)

    await client.getCloses(['NOPE'], FROM, TO)
    await client.getCloses(['NOPE'], FROM, TO)

    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('keeps the cached range when the request fails', async () => {
    await seed([
      { symbol: 'FWIA.DE', date: '2025-03-10', close: 40.1, fetchedAt: Date.now() - TIP_TTL_MS - 1 },
    ])
    const fetcher = failing()
    const client = new MarketDataClient(fetcher)

    const { closes } = await client.getCloses(['FWIA.DE'], FROM, TO)

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(closes.get('FWIA.DE:2025-03-10')).toBe(40.1)
  })

  it('keeps the week of run-up before the range, and nothing older', async () => {
    await seed([
      { symbol: 'FWIA.DE', date: '2025-02-01', close: 38 },
      { symbol: 'FWIA.DE', date: '2025-03-07', close: 40.2 },
      { symbol: 'FWIA.DE', date: '2025-03-11', close: 40.85 },
    ])
    const client = new MarketDataClient(respondWith({}))

    const { closes } = await client.getCloses(['FWIA.DE'], FROM, TO)

    // The range starts on Monday the 10th; the Friday before it is what prices
    // a holding over the weekend, so dropping it is what leaves the first days
    // of a period unvalued.
    expect([...closes.keys()]).toEqual(['FWIA.DE:2025-03-07', 'FWIA.DE:2025-03-11'])
  })

  it('still asks for a month between two ranges it fetched separately', async () => {
    // Viewing March and then January must not make February look covered: the
    // two answers are disjoint, and nothing ever asked about the span between.
    await seed([
      { symbol: 'FWIA.DE', date: '2025-03-03', close: 41, fetchedAt: Date.now() - 2 * TIP_TTL_MS },
      { symbol: 'FWIA.DE', date: '2025-03-13', close: 41.4, fetchedAt: Date.now() - 2 * TIP_TTL_MS },
    ])
    await seed([
      { symbol: 'FWIA.DE', date: '2025-01-02', close: 38, fetchedAt: Date.now() - 3 * TIP_TTL_MS },
      { symbol: 'FWIA.DE', date: '2025-01-31', close: 39, fetchedAt: Date.now() - 3 * TIP_TTL_MS },
    ])
    const fetcher = respondWith({ 'FWIA.DE': { currency: 'EUR', closes: { '2025-02-03': 40 } } })
    const client = new MarketDataClient(fetcher)

    const { closes } = await client.getCloses(
      ['FWIA.DE'],
      new UTCDate('2025-02-01T00:00:00Z'),
      new UTCDate('2025-02-28T00:00:00Z')
    )

    expect(fetcher).toHaveBeenCalledWith(['FWIA.DE'], '2025-02-01', '2025-02-28')
    expect(closes.get('FWIA.DE:2025-02-03')).toBe(40)
  })

  it('keeps two answers written in the same millisecond apart', async () => {
    // What a request covered is recovered by grouping the rows it wrote on
    // their fetchedAt, so two answers sharing a stamp merge into one span and
    // swallow the window between them - the January/March/February hole again,
    // except written to IndexedDB rather than merely believed for a session.
    // The clock is frozen here, so a plain Date.now() stamps both alike.
    const fetcher = vi
      .fn<(symbols: string[], from: string, to: string) => Promise<PriceFetchOutcome>>()
      .mockResolvedValueOnce({ ok: true, prices: { 'FWIA.DE': { currency: 'EUR', closes: { '2025-01-02': 38 } } } })
      .mockResolvedValueOnce({ ok: true, prices: { 'FWIA.DE': { currency: 'EUR', closes: { '2025-03-03': 41 } } } })
      .mockResolvedValueOnce({ ok: true, prices: { 'FWIA.DE': { currency: 'EUR', closes: { '2025-02-03': 40 } } } })
    const client = new MarketDataClient(fetcher)

    await client.getCloses(['FWIA.DE'], new UTCDate('2025-01-01T00:00:00Z'), new UTCDate('2025-01-31T00:00:00Z'))
    await client.getCloses(['FWIA.DE'], new UTCDate('2025-03-01T00:00:00Z'), new UTCDate('2025-03-14T00:00:00Z'))

    const { closes } = await client.getCloses(
      ['FWIA.DE'],
      new UTCDate('2025-02-01T00:00:00Z'),
      new UTCDate('2025-02-28T00:00:00Z')
    )

    expect(fetcher).toHaveBeenNthCalledWith(3, ['FWIA.DE'], '2025-02-01', '2025-02-28')
    expect(closes.get('FWIA.DE:2025-02-03')).toBe(40)
  })

  it('does not retry a failure on the very next render', async () => {
    // A 500 leaves the link looking perfectly healthy, so nothing else would
    // stop a re-render from asking again immediately, and again after that.
    const fetcher = failing()
    const client = new MarketDataClient(fetcher)

    await client.getCloses(['FWIA.DE'], FROM, TO)
    await client.getCloses(['FWIA.DE'], FROM, TO)

    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('tries again after a failed request instead of sitting out the hour', async () => {
    await seed([
      { symbol: 'FWIA.DE', date: '2025-03-10', close: 40.1, fetchedAt: Date.now() - TIP_TTL_MS - 1 },
    ])
    const fetcher = vi
      .fn<(symbols: string[], from: string, to: string) => Promise<PriceFetchOutcome>>()
      .mockResolvedValueOnce({ ok: false, retryable: true })
      .mockResolvedValueOnce({ ok: true, prices: { 'FWIA.DE': { currency: 'EUR', closes: { '2025-03-14': 41.9 } } } })
    const client = new MarketDataClient(fetcher)

    await client.getCloses(['FWIA.DE'], FROM, TO)
    vi.setSystemTime(new UTCDate(Date.now() + RETRY_AFTER_FAILURE_MS + 1))
    const { closes } = await client.getCloses(['FWIA.DE'], FROM, TO)

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(closes.get('FWIA.DE:2025-03-14')).toBe(41.9)
  })

  it('asks for nothing at all while the link is known to be down', async () => {
    const fetcher = failing()
    const client = new MarketDataClient(fetcher)

    await client.getCloses(['FWIA.DE'], FROM, TO)
    vi.stubGlobal('navigator', { onLine: false })
    // Long enough that nothing but the state of the link is holding it back.
    vi.setSystemTime(new UTCDate(Date.now() + RETRY_AFTER_FAILURE_MS + 1))
    await client.getCloses(['FWIA.DE'], FROM, TO)

    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('still asks while the link is merely presumed unreachable', async () => {
    // 'unreachable' is a guess drawn from two failed calls, and prices go
    // through the same client that counts them - so two flaky price calls used
    // to mark the link unreachable and then never make the request that could
    // clear it. Only a link navigator itself calls down stops us asking.
    const fetcher = failing()
    const client = new MarketDataClient(fetcher)

    await client.getCloses(['FWIA.DE'], FROM, TO)
    reportRequestOutcome('network-failure')
    reportRequestOutcome('network-failure')
    vi.setSystemTime(new UTCDate(Date.now() + RETRY_AFTER_FAILURE_MS + 1))
    await client.getCloses(['FWIA.DE'], FROM, TO)

    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('holds off an hour on a request the server refused, not thirty seconds', async () => {
    // A range past the day cap is a 4xx: the server understood and said no, so
    // resending it unchanged every thirty seconds forever achieves nothing.
    const fetcher = refusing()
    const client = new MarketDataClient(fetcher)

    await client.getCloses(['FWIA.DE'], FROM, TO)
    vi.setSystemTime(new UTCDate(Date.now() + RETRY_AFTER_FAILURE_MS + 1))
    await client.getCloses(['FWIA.DE'], FROM, TO)

    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('picks straight back up when the link returns, without waiting out the pause', async () => {
    const fetcher = vi
      .fn<(symbols: string[], from: string, to: string) => Promise<PriceFetchOutcome>>()
      .mockResolvedValueOnce({ ok: false, retryable: true })
      .mockResolvedValueOnce({ ok: true, prices: { 'FWIA.DE': { currency: 'EUR', closes: { '2025-03-14': 41.9 } } } })
    const client = new MarketDataClient(fetcher)

    await client.getCloses(['FWIA.DE'], FROM, TO)
    reportRequestOutcome('network-failure')
    reportRequestOutcome('network-failure')
    await client.getCloses(['FWIA.DE'], FROM, TO)
    resetNetworkStatus()

    // Same instant as the failure: the outage is over, so what it earned is too.
    const { closes } = await client.getCloses(['FWIA.DE'], FROM, TO)

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(closes.get('FWIA.DE:2025-03-14')).toBe(41.9)
  })

  it('asks for nothing when given no symbols', async () => {
    const fetcher = respondWith({})
    const client = new MarketDataClient(fetcher)

    const { closes } = await client.getCloses([], FROM, TO)

    expect(closes.size).toBe(0)
    expect(fetcher).not.toHaveBeenCalled()
  })
})

/**
 * Prices go out over the shared api-client, not over a raw fetch, for one
 * reason: an access token expires in minutes. A raw fetch turns every 401 into
 * "no prices" and nothing else would ever heal it, because /sync - the other
 * request that renews a session - is behind withPremium.
 */
describe('reaching the server', () => {
  it('renews an expired session and retries, rather than reporting no prices', async () => {
    let priceCalls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/refresh')) {
        return jsonResponse({ success: true })
      }
      priceCalls += 1
      return priceCalls === 1
        ? jsonResponse({ success: false, error: 'Unauthorized' }, 401)
        : jsonResponse({ success: true, data: { 'FWIA.DE': { currency: 'EUR', closes: { '2025-03-14': 41.9 } } } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { closes } = await new MarketDataClient().getCloses(['FWIA.DE'], FROM, TO)

    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      '/api/v1/prices?symbols=FWIA.DE&from=2025-03-10&to=2025-03-14',
      '/api/v1/refresh',
      '/api/v1/prices?symbols=FWIA.DE&from=2025-03-10&to=2025-03-14',
    ])
    expect(closes.get('FWIA.DE:2025-03-14')).toBe(41.9)
  })

  it('sends a symbol search the same way', async () => {
    const candidate = { symbol: 'FWIA.DE', name: 'Franklin FTSE India', currency: '', exchange: 'XETRA' }
    const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () =>
      jsonResponse({ success: true, data: { results: [candidate] } })
    )
    vi.stubGlobal('fetch', fetchMock)

    const results = await searchSymbols('IE00BHZRQZ17')

    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/v1/prices/search?q=IE00BHZRQZ17')
    expect(results).toEqual([candidate])
  })

  it('renews an expired session for a search too, rather than finding nothing', async () => {
    // A search runs while the user is entering a trade, which is exactly when an
    // access token minted at signin has had time to expire. Swallowing the 401
    // as "no such instrument" sends them off to correct a symbol that was right.
    const candidate = { symbol: 'FWIA.DE', name: 'Franklin FTSE India', currency: '', exchange: 'XETRA' }
    let searchCalls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/refresh')) {
        return jsonResponse({ success: true })
      }
      searchCalls += 1
      return searchCalls === 1
        ? jsonResponse({ success: false, error: 'Unauthorized' }, 401)
        : jsonResponse({ success: true, data: { results: [candidate] } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const results = await searchSymbols('IE00BHZRQZ17')

    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      '/api/v1/prices/search?q=IE00BHZRQZ17',
      '/api/v1/refresh',
      '/api/v1/prices/search?q=IE00BHZRQZ17',
    ])
    expect(results).toEqual([candidate])
  })

  it('answers with no candidates when the search fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: false, error: 'nope' }, 503)))

    expect(await searchSymbols('IE00BHZRQZ17')).toEqual([])
  })
})
