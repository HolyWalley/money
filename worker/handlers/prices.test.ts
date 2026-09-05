import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { UTCDate } from '@date-fns/utc'
import type { CloudflareEnv } from '../types/cloudflare'
import type { DateRange, MarketDataProvider } from '../../shared/market-data'
import type { StoredClose, StoredInstrument, SymbolFetchRange } from '../durable-objects/MarketObject'
import { createPriceCacheKey, findClose, mergeRanges, planPriceFetch } from '../../shared/market-data'
import {
  MAX_FETCHES_PER_SYMBOL,
  MAX_RANGE_DAYS,
  MAX_SYMBOLS_PER_REQUEST,
  boundFanOut,
  onRequestGet,
  onRequestGetSearch,
} from './prices'

/**
 * The durable object's storage rules, in memory: closes are keyed by symbol and
 * day, a day never moves once it has settled, and gaps are judged from the
 * ranges already examined (planPriceFetch).
 *
 * This is a paraphrase, which is exactly why MarketObject.test.ts runs the real
 * SQL: the rules below are pinned there, and these tests are about the handler.
 */
class FakeMarketObject {
  closes = new Map<string, StoredClose>()
  instruments = new Map<string, StoredInstrument>()
  examined = new Map<string, DateRange[]>()

  async planFetch(symbols: string[], from: string, to: string, today: string): Promise<SymbolFetchRange[]> {
    return symbols.flatMap((symbol) => {
      const unsettled = [...this.closes.values()]
        .filter((row) => row.symbol === symbol && row.settled === false)
        .map((row) => row.date)
        .sort()
      return planPriceFetch(this.examined.get(symbol) ?? [], from, to, today, unsettled[0] ?? null).map((range) => ({
        symbol,
        ...range,
      }))
    })
  }

  async markExamined(ranges: SymbolFetchRange[]): Promise<void> {
    for (const range of ranges) {
      const current = this.examined.get(range.symbol) ?? []
      this.examined.set(range.symbol, mergeRanges([...current, { from: range.from, to: range.to }]))
    }
  }

  async getCloses(symbols: string[], from: string, to: string): Promise<StoredClose[]> {
    return [...this.closes.values()]
      .filter((row) => symbols.includes(row.symbol) && row.date >= from && row.date <= to)
      .sort((a, b) => (a.symbol + a.date < b.symbol + b.date ? -1 : 1))
  }

  async putCloses(rows: StoredClose[], refreshableFrom: string): Promise<void> {
    for (const row of rows) {
      const key = createPriceCacheKey(row.symbol, row.date)
      const stored = this.closes.get(key)
      if (stored && stored.settled !== false && row.date < refreshableFrom) continue
      this.closes.set(key, { ...row, settled: row.settled !== false })
    }
  }

  async getInstruments(symbols: string[]): Promise<StoredInstrument[]> {
    return symbols.map((symbol) => this.instruments.get(symbol)).filter((row): row is StoredInstrument => !!row)
  }

  async putInstruments(rows: StoredInstrument[]): Promise<void> {
    for (const row of rows) {
      const existing = this.instruments.get(row.symbol)
      this.instruments.set(row.symbol, {
        symbol: row.symbol,
        name: row.name || existing?.name || '',
        currency: row.currency || existing?.currency || '',
        exchange: row.exchange || existing?.exchange || '',
      })
    }
  }
}

function envWith(market: FakeMarketObject): CloudflareEnv {
  return {
    MARKET_OBJECT: {
      idFromName: (name: string) => name,
      get: () => market,
    },
  } as unknown as CloudflareEnv
}

function pricesRequest(query: string): Request {
  return new Request(`https://example.test/api/v1/prices?${query}`)
}

function searchRequest(query: string): Request {
  return new Request(`https://example.test/api/v1/prices/search?${query}`)
}

function providerReturning(closes: Record<string, Array<{ date: string; close: number }>>, currency = 'EUR'): MarketDataProvider {
  return {
    getDailyCloses: vi.fn(async (symbol: string) =>
      (closes[symbol] ?? []).map((row) => ({ ...row, currency }))
    ),
    search: vi.fn(async () => []),
  }
}

let market: FakeMarketObject

beforeEach(() => {
  market = new FakeMarketObject()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function closesOf(response: Response): Promise<Record<string, Record<string, number>>> {
  const body = (await response.json()) as { data: Record<string, { closes: Record<string, number> }> }
  return Object.fromEntries(Object.entries(body.data).map(([symbol, prices]) => [symbol, prices.closes]))
}

describe('bounds on what one request may ask for', () => {
  it('rejects more symbols than the fan-out cap allows, without calling the provider', async () => {
    const symbols = Array.from({ length: MAX_SYMBOLS_PER_REQUEST + 1 }, (_, i) => `SYM${i}`)
    const provider = providerReturning({})

    const response = await onRequestGet(
      pricesRequest(`symbols=${symbols.join(',')}&from=2025-03-10&to=2025-03-14`),
      envWith(market),
      provider
    )

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      errors: [`At most ${MAX_SYMBOLS_PER_REQUEST} symbols per request`],
    })
    expect(provider.getDailyCloses).not.toHaveBeenCalled()
  })

  it('rejects a range longer than the cap', async () => {
    const provider = providerReturning({})

    const response = await onRequestGet(
      pricesRequest('symbols=FWIA.DE&from=2020-01-01&to=2025-03-14'),
      envWith(market),
      provider
    )

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ errors: [`At most ${MAX_RANGE_DAYS} days per request`] })
    expect(provider.getDailyCloses).not.toHaveBeenCalled()
  })

  it('accepts a range exactly at the cap, run-up included', async () => {
    const provider = providerReturning({})
    // 400 days asked for, plus the week of run-up the answer is seeded with:
    // the cap counts the window actually fetched, so it carries those days.
    const from = '2024-01-01'
    const to = '2025-02-03'

    const response = await onRequestGet(
      pricesRequest(`symbols=FWIA.DE&from=${from}&to=${to}`),
      envWith(market),
      provider
    )

    expect(response.status).toBe(200)
  })

  it('counts the run-up against the cap rather than only what was asked for', async () => {
    const provider = providerReturning({})

    const response = await onRequestGet(
      pricesRequest('symbols=FWIA.DE&from=2023-12-31&to=2025-02-03'),
      envWith(market),
      provider
    )

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ errors: [`At most ${MAX_RANGE_DAYS} days per request`] })
  })

  it('rejects dates that are not calendar days, and a reversed range', async () => {
    const bad = await onRequestGet(pricesRequest('symbols=FWIA.DE&from=yesterday&to=2025-03-14'), envWith(market), providerReturning({}))
    const reversed = await onRequestGet(pricesRequest('symbols=FWIA.DE&from=2025-03-14&to=2025-03-10'), envWith(market), providerReturning({}))

    expect(bad.status).toBe(422)
    expect(reversed.status).toBe(422)
    expect(await reversed.json()).toMatchObject({ errors: ['from must not be after to'] })
  })

  it('rejects a day that looks like a date but never happened', async () => {
    // 'YYYY-MM-DD'-shaped but not a day: one parses to nothing, which slips past
    // the range cap as a NaN width and reaches the provider as period1=NaN; the
    // other quietly slides to March 2nd.
    const provider = providerReturning({})

    const noSuchMonth = await onRequestGet(
      pricesRequest('symbols=FWIA.DE&from=2025-00-05&to=2025-03-14'),
      envWith(market),
      provider
    )
    const noSuchDay = await onRequestGet(
      pricesRequest('symbols=FWIA.DE&from=2025-02-30&to=2025-03-14'),
      envWith(market),
      provider
    )

    expect(noSuchMonth.status).toBe(422)
    expect(noSuchDay.status).toBe(422)
    expect(await noSuchMonth.json()).toMatchObject({ errors: ['from and to must be YYYY-MM-DD dates'] })
    expect(provider.getDailyCloses).not.toHaveBeenCalled()
  })

  it('rejects a symbol that is not shaped like one, and an empty symbol list', async () => {
    const junk = await onRequestGet(pricesRequest('symbols=DROP%20TABLE&from=2025-03-10&to=2025-03-14'), envWith(market), providerReturning({}))
    const empty = await onRequestGet(pricesRequest('symbols=&from=2025-03-10&to=2025-03-14'), envWith(market), providerReturning({}))

    expect(junk.status).toBe(422)
    expect(empty.status).toBe(422)
    expect(await empty.json()).toMatchObject({ errors: ['At least one symbol is required'] })
  })
})

describe('serving prices', () => {
  it('fetches what is missing and answers with closes keyed by day', async () => {
    const provider = providerReturning({
      'FWIA.DE': [
        { date: '2025-03-10', close: 40.1 },
        { date: '2025-03-11', close: 40.85 },
      ],
    })

    const response = await onRequestGet(
      pricesRequest('symbols=FWIA.DE&from=2025-03-10&to=2025-03-11'),
      envWith(market),
      provider
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      data: {
        'FWIA.DE': { currency: 'EUR', closes: { '2025-03-10': 40.1, '2025-03-11': 40.85 } },
      },
    })
  })

  it('does not go back to the provider for a past range it has already stored', async () => {
    const provider = providerReturning({
      'FWIA.DE': [
        { date: '2025-03-10', close: 40.1 },
        { date: '2025-03-11', close: 40.85 },
      ],
    })
    const query = 'symbols=FWIA.DE&from=2025-03-10&to=2025-03-11'

    await onRequestGet(pricesRequest(query), envWith(market), provider)
    await onRequestGet(pricesRequest(query), envWith(market), provider)

    expect(provider.getDailyCloses).toHaveBeenCalledTimes(1)
  })

  it('asks only for the days after the newest stored session', async () => {
    const provider = providerReturning({ 'FWIA.DE': [{ date: '2025-03-10', close: 40.1 }] })

    await onRequestGet(pricesRequest('symbols=FWIA.DE&from=2025-03-01&to=2025-03-10'), envWith(market), provider)
    await onRequestGet(pricesRequest('symbols=FWIA.DE&from=2025-03-01&to=2025-03-12'), envWith(market), provider)

    expect(provider.getDailyCloses).toHaveBeenCalledTimes(2)
    expect(provider.getDailyCloses).toHaveBeenLastCalledWith(
      'FWIA.DE',
      new Date('2025-03-11T00:00:00.000Z'),
      new Date('2025-03-12T00:00:00.000Z')
    )
  })

  it('keeps serving stored history when the provider is down', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await market.putCloses([{ symbol: 'FWIA.DE', date: '2025-03-10', close: 40.1 }], '2025-03-10')
    await market.putInstruments([{ symbol: 'FWIA.DE', name: '', currency: 'EUR', exchange: '' }])

    const failing: MarketDataProvider = {
      getDailyCloses: vi.fn(async () => {
        throw new Error('Yahoo is unreachable')
      }),
      search: vi.fn(async () => []),
    }

    const response = await onRequestGet(
      // Reaches back before what is stored, so the provider is definitely asked.
      pricesRequest('symbols=FWIA.DE&from=2025-03-01&to=2025-03-11'),
      envWith(market),
      failing
    )

    expect(failing.getDailyCloses).toHaveBeenCalled()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      data: { 'FWIA.DE': { currency: 'EUR', closes: { '2025-03-10': 40.1 } } },
    })
  })

  it('retries a range the provider failed on, instead of marking it known-empty', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const getDailyCloses = vi
      .fn<MarketDataProvider['getDailyCloses']>()
      .mockRejectedValueOnce(new Error('Yahoo is unreachable'))
      .mockResolvedValueOnce([{ date: '2025-03-10', close: 40.1, currency: 'EUR' }])
    const provider: MarketDataProvider = { getDailyCloses, search: vi.fn(async () => []) }
    const query = 'symbols=FWIA.DE&from=2025-03-10&to=2025-03-11'

    const first = await onRequestGet(pricesRequest(query), envWith(market), provider)
    const second = await onRequestGet(pricesRequest(query), envWith(market), provider)

    expect(await first.json()).toMatchObject({ data: {} })
    expect(await second.json()).toMatchObject({ data: { 'FWIA.DE': { closes: { '2025-03-10': 40.1 } } } })
  })

  it('does not ask again for a range the market simply had no sessions in', async () => {
    const provider = providerReturning({ 'FWIA.DE': [{ date: '2025-03-10', close: 40.1 }] })

    // 2025-03-08 and 09 are a weekend: the provider will never have closes for
    // them, so a second request must not go looking for them again.
    await onRequestGet(pricesRequest('symbols=FWIA.DE&from=2025-03-08&to=2025-03-10'), envWith(market), provider)
    await onRequestGet(pricesRequest('symbols=FWIA.DE&from=2025-03-08&to=2025-03-10'), envWith(market), provider)

    expect(provider.getDailyCloses).toHaveBeenCalledTimes(1)
  })

  it('keeps a settled close even when the provider hands back a different number for it', async () => {
    await market.putCloses([{ symbol: 'FWIA.DE', date: '2025-03-10', close: 40.1 }], '2025-03-10')
    await market.putInstruments([{ symbol: 'FWIA.DE', name: '', currency: 'EUR', exchange: '' }])

    // The gap is the weekend before, but a chart request comes back with whole
    // sessions: the settled day rides along and must not overwrite what is stored.
    const provider = providerReturning({
      'FWIA.DE': [
        { date: '2025-03-07', close: 39 },
        { date: '2025-03-10', close: 99.9 },
      ],
    })

    const response = await onRequestGet(
      pricesRequest('symbols=FWIA.DE&from=2025-03-07&to=2025-03-10'),
      envWith(market),
      provider
    )

    expect(await response.json()).toEqual({
      success: true,
      data: { 'FWIA.DE': { currency: 'EUR', closes: { '2025-03-07': 39, '2025-03-10': 40.1 } } },
    })
  })

  it('reaches back before the requested range so a period starting on a weekend can be valued', async () => {
    // 2025-03-15 is a Saturday. Nothing closed on it and nothing ever will, so
    // the first days of the period can only be priced from the Friday before
    // the range starts - which the caller never gets to see if the answer is
    // clipped at `from`.
    const provider = providerReturning({
      'FWIA.DE': [
        { date: '2025-03-14', close: 41.9 },
        { date: '2025-03-17', close: 42.4 },
      ],
    })

    const response = await onRequestGet(
      pricesRequest('symbols=FWIA.DE&from=2025-03-15&to=2025-03-18'),
      envWith(market),
      provider
    )

    expect(provider.getDailyCloses).toHaveBeenCalledWith(
      'FWIA.DE',
      new Date('2025-03-08T00:00:00.000Z'),
      new Date('2025-03-18T00:00:00.000Z')
    )

    const closes = (await closesOf(response))['FWIA.DE']
    const asMap = new Map(
      Object.entries(closes).map(([date, close]) => [createPriceCacheKey('FWIA.DE', date), close])
    )
    expect(findClose(asMap, 'FWIA.DE', new UTCDate('2025-03-15T00:00:00Z'))).toBe(41.9)
  })

  it('replaces a price it was handed mid-session, even when nobody asks again until the tip has moved on', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // A Friday, 18:00 UTC: the US session is still open, so this number is an
    // intraday quote wearing Friday's date, not Friday's close.
    vi.setSystemTime(new UTCDate('2025-03-14T18:00:00Z'))
    const intraday = providerReturning({ 'FWIA.DE': [{ date: '2025-03-14', close: 41 }] })
    await onRequestGet(pricesRequest('symbols=FWIA.DE&from=2025-03-14&to=2025-03-14'), envWith(market), intraday)

    // A week later, long past the refreshable tip.
    vi.setSystemTime(new UTCDate('2025-03-21T12:00:00Z'))
    const settled = providerReturning({
      'FWIA.DE': [
        { date: '2025-03-14', close: 41.9 },
        { date: '2025-03-17', close: 42.4 },
      ],
    })
    const response = await onRequestGet(
      pricesRequest('symbols=FWIA.DE&from=2025-03-14&to=2025-03-21'),
      envWith(market),
      settled
    )

    expect((await closesOf(response))['FWIA.DE']['2025-03-14']).toBe(41.9)
  })

  it('leaves a close another session has already followed alone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new UTCDate('2025-03-17T18:00:00Z'))
    const provider = providerReturning({
      'FWIA.DE': [
        { date: '2025-03-14', close: 41.9 },
        { date: '2025-03-17', close: 42.4 },
      ],
    })
    await onRequestGet(pricesRequest('symbols=FWIA.DE&from=2025-03-14&to=2025-03-17'), envWith(market), provider)

    vi.setSystemTime(new UTCDate('2025-03-24T12:00:00Z'))
    const revised = providerReturning({ 'FWIA.DE': [{ date: '2025-03-14', close: 99.9 }] })
    const response = await onRequestGet(
      pricesRequest('symbols=FWIA.DE&from=2025-03-14&to=2025-03-24'),
      envWith(market),
      revised
    )

    expect((await closesOf(response))['FWIA.DE']['2025-03-14']).toBe(41.9)
  })

  it('asks the provider once per symbol and answers for each', async () => {
    const provider = providerReturning({
      'FWIA.DE': [{ date: '2025-03-10', close: 40.1 }],
      'VWCE.DE': [{ date: '2025-03-10', close: 128.4 }],
    })

    const response = await onRequestGet(
      pricesRequest('symbols=FWIA.DE,VWCE.DE,FWIA.DE&from=2025-03-10&to=2025-03-11'),
      envWith(market),
      provider
    )

    // The repeated symbol is collapsed before anything is fetched.
    expect(provider.getDailyCloses).toHaveBeenCalledTimes(2)
    const body = await response.json() as { data: Record<string, unknown> }
    expect(Object.keys(body.data)).toEqual(['FWIA.DE', 'VWCE.DE'])
  })
})

describe('symbol search', () => {
  it('rejects a query too short to mean anything', async () => {
    const provider = providerReturning({})

    const response = await onRequestGetSearch(searchRequest('q=a'), envWith(market), provider)

    expect(response.status).toBe(422)
    expect(provider.search).not.toHaveBeenCalled()
  })

  it('returns candidates and remembers what the search knew about them', async () => {
    const provider: MarketDataProvider = {
      getDailyCloses: vi.fn(async () => []),
      search: vi.fn(async () => [{ symbol: 'FWIA.DE', name: 'Franklin FTSE India', currency: '', exchange: 'XETRA' }]),
    }

    const response = await onRequestGetSearch(searchRequest('q=IE00BHZRQZ17'), envWith(market), provider)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      data: { results: [{ symbol: 'FWIA.DE', name: 'Franklin FTSE India', currency: '', exchange: 'XETRA' }] },
    })
    expect(market.instruments.get('FWIA.DE')).toMatchObject({ name: 'Franklin FTSE India', exchange: 'XETRA' })
  })

  it('reports a provider outage as an outage, not as an empty result', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const provider: MarketDataProvider = {
      getDailyCloses: vi.fn(async () => []),
      search: vi.fn(async () => {
        throw new Error('Yahoo is unreachable')
      }),
    }

    const response = await onRequestGetSearch(searchRequest('q=IE00BHZRQZ17'), envWith(market), provider)

    expect(response.status).toBe(503)
  })
})

describe('boundFanOut', () => {
  const range = (symbol: string, from: string, to: string): SymbolFetchRange => ({ symbol, from, to })

  it('leaves a plan inside the cap exactly as it is', () => {
    const plan = [range('A', '2025-01-01', '2025-01-31'), range('A', '2025-03-01', '2025-03-14')]

    expect(boundFanOut(plan)).toEqual(plan)
  })

  it('collapses a symbol with more holes than the cap into one spanning call', () => {
    // Tracking examined ranges as a list gives one plan entry per hole, so a
    // store built from scattered visits would otherwise cost a provider call
    // per hole - unbounded, inside a worker with a subrequest budget.
    const plan = [
      range('A', '2025-01-01', '2025-01-31'),
      range('A', '2025-03-01', '2025-03-14'),
      range('A', '2025-05-01', '2025-05-31'),
    ]

    expect(boundFanOut(plan)).toEqual([range('A', '2025-01-01', '2025-05-31')])
  })

  it('bounds each symbol on its own', () => {
    const plan = [
      range('A', '2025-01-01', '2025-01-31'),
      range('A', '2025-03-01', '2025-03-14'),
      range('A', '2025-05-01', '2025-05-31'),
      range('B', '2025-02-01', '2025-02-28'),
    ]

    const bounded = boundFanOut(plan)

    expect(bounded).toHaveLength(2)
    expect(bounded).toContainEqual(range('A', '2025-01-01', '2025-05-31'))
    expect(bounded).toContainEqual(range('B', '2025-02-01', '2025-02-28'))
  })

  it('never asks the provider more than the cap allows per symbol', () => {
    const plan = Array.from({ length: 9 }, (_, index) =>
      range('A', `2025-0${index + 1}-01`, `2025-0${index + 1}-05`)
    )

    expect(boundFanOut(plan).length).toBeLessThanOrEqual(MAX_FETCHES_PER_SYMBOL)
  })
})
