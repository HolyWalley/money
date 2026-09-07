import { act, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { deferred, renderHookSuspended } from '@/test/suspense'
import { usePortfolio } from './usePortfolio'
import { db } from '@/lib/db-dexie'
import { TIP_TTL_MS, marketDataClient, type PricesResponse } from '@/lib/market-data-client'
import type { Deferred } from '@/lib/suspense'
import { resetResources } from '@/lib/suspense-resource'
import type { Instrument } from '../../shared/schemas/instrument.schema'
import type { Trade, TradeKind } from '../../shared/schemas/trade.schema'

const mocks = vi.hoisted(() => ({
  trades: [] as Trade[],
  instruments: [] as Instrument[],
  /** Units of the currency per one unit of the base, as the rate service quotes them. */
  rates: new Map<string, number>(),
  /** What the server answers, by symbol; only the symbols asked for come back. */
  prices: {} as PricesResponse,
  symbolRequests: [] as string[][],
  currencyRequests: [] as string[][],
  /** The currencies whose rates were started before anything was read. */
  preloadedCurrencies: [] as string[][],
  /** Set to hold the answer back, so a request still in flight can be observed. */
  pending: null as Deferred<PricesResponse> | null,
}))

vi.mock('./useLiveTrades', () => ({
  useLiveTrades: () => mocks.trades,
}))

vi.mock('./useLiveInstruments', () => ({
  useLiveInstruments: () => mocks.instruments,
}))

vi.mock('./useCurrentRates', () => ({
  usePreloadCurrentRates: (currencies: string[]) => {
    mocks.preloadedCurrencies.push(currencies)
  },
  useCurrentRates: (currencies: string[]) => {
    mocks.currencyRequests.push(currencies)
    return {
      convert: (amount: number, currency: string) => {
        if (currency === 'EUR') return amount
        const rate = mocks.rates.get(currency)
        return rate === undefined ? null : amount / rate
      },
      baseCurrency: 'EUR',
    }
  },
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getPrices: async (symbols: string[]) => {
      mocks.symbolRequests.push(symbols)
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

function dayKey(daysAgo = 0): string {
  const day = new Date()
  day.setUTCDate(day.getUTCDate() - daysAgo)
  return day.toISOString().split('T')[0]
}

/** What the server will answer for `symbol`, quoted in `currency`. */
function priceOn(symbol: string, close: number, daysAgo = 0, currency = 'EUR') {
  const prices = mocks.prices[symbol] ?? { currency, closes: {} }
  prices.closes[dayKey(daysAgo)] = close
  mocks.prices[symbol] = prices
}

/** A close already in IndexedDB, as an earlier session left it. */
async function cacheClose(symbol: string, close: number, daysAgo = 0, fetchedAt = Date.now()) {
  const date = dayKey(daysAgo)
  await db.instrumentPrices.put({ key: `${symbol}:${date}`, symbol, date, close, currency: 'EUR', fetchedAt })
}

let tradeCount = 0

function trade(
  kind: TradeKind,
  instrumentId: string,
  fields: { quantity?: number, amount: number, currency?: string, daysAgo?: number }
): Trade {
  tradeCount++
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - (fields.daysAgo ?? 30))

  return {
    _id: `trade-${tradeCount}`,
    type: 'trade',
    accountId: 'acc-1',
    instrumentId,
    kind,
    date: date.toISOString(),
    quantity: fields.quantity ?? 0,
    amount: fields.amount,
    currency: fields.currency ?? 'EUR',
    fee: 0,
    externalId: `ext-${tradeCount}`,
    createdAt: date.toISOString(),
    updatedAt: date.toISOString(),
  }
}

function instrument(id: string, name: string, overrides: Partial<Instrument> = {}): Instrument {
  return {
    _id: id,
    type: 'instrument',
    name,
    currency: 'EUR',
    kind: 'etf',
    symbol: `${id.toUpperCase()}.DE`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

async function loadPortfolio() {
  const rendered = await renderHookSuspended(() => usePortfolio())
  await waitFor(() => expect(rendered.result.current).not.toBeNull())
  // A render whose key changed suspends in a deferred lane, and one that
  // suspends inside a synchronous act is never retried.
  const rerender = () => act(async () => rendered.rerender())
  return { ...rendered, rerender }
}

function positionOf(positions: ReturnType<typeof usePortfolio>['positions'], instrumentId: string) {
  const position = positions.find(entry => entry.instrumentId === instrumentId)
  if (!position) throw new Error(`no position for ${instrumentId}`)
  return position
}

beforeEach(async () => {
  await db.instrumentPrices.clear()
  await db.priceFetches.clear()
  marketDataClient.resetForTests()
  resetResources()
  mocks.trades = []
  mocks.instruments = []
  mocks.rates = new Map()
  mocks.prices = {}
  mocks.symbolRequests = []
  mocks.currencyRequests = []
  mocks.preloadedCurrencies = []
  mocks.pending = null
  tradeCount = 0
})

describe('usePortfolio', () => {
  it('values a holding at its latest close', async () => {
    mocks.instruments = [instrument('inst-1', 'Invesco FTSE All-World')]
    mocks.trades = [trade('buy', 'inst-1', { quantity: 10, amount: -1000 })]
    priceOn('INST-1.DE', 120)

    const { result } = await loadPortfolio()

    expect(positionOf(result.current.positions, 'inst-1')).toMatchObject({
      quantity: 10,
      cost: 1000,
      close: 120,
      marketValue: 1200,
      unrealised: 200,
      status: 'priced',
    })
    expect(result.current.summary.marketValue).toBe(1200)
    expect(result.current.summary.unrealised).toBe(200)
  })

  it('falls back to the last session when the market was shut today', async () => {
    mocks.instruments = [instrument('inst-1', 'Invesco FTSE All-World')]
    mocks.trades = [trade('buy', 'inst-1', { quantity: 10, amount: -1000 })]
    priceOn('INST-1.DE', 111, 3)

    const { result } = await loadPortfolio()

    expect(positionOf(result.current.positions, 'inst-1').close).toBe(111)
  })

  it('converts a foreign holding into the base currency', async () => {
    mocks.rates = new Map([['USD', 1.1]])
    mocks.instruments = [instrument('inst-1', 'Vanguard S&P 500', { currency: 'USD', symbol: 'VUAA' })]
    mocks.trades = [trade('buy', 'inst-1', { quantity: 4, amount: -400, currency: 'USD' })]
    priceOn('VUAA', 110, 0, 'USD')

    const { result } = await loadPortfolio()

    const position = positionOf(result.current.positions, 'inst-1')
    expect(position.marketValue).toBe(440)
    expect(position.marketValueInBase).toBeCloseTo(400, 8)
    expect(result.current.summary.marketValue).toBeCloseTo(400, 8)
  })

  // The feed answers in whatever the listing is quoted in, which is not always
  // the currency the holding settles in - an ISIN resolves to a London USD line
  // as happily as to the Xetra EUR one.
  it('restates a close quoted in another currency before valuing the holding', async () => {
    mocks.rates = new Map([['USD', 1.25]])
    mocks.instruments = [instrument('inst-1', 'iShares Core S&P 500')]
    mocks.trades = [trade('buy', 'inst-1', { quantity: 10, amount: -1000 })]
    priceOn('INST-1.DE', 125, 0, 'USD')

    const { result } = await loadPortfolio()

    const position = positionOf(result.current.positions, 'inst-1')
    expect(position.quoteCurrency).toBe('USD')
    expect(position.close).toBeCloseTo(100, 8)
    expect(position.marketValue).toBeCloseTo(1000, 8)
  })

  it('leaves a holding unpriced when its quote currency has no rate', async () => {
    mocks.instruments = [instrument('inst-1', 'Legal & General', { symbol: 'LGEN.L' })]
    mocks.trades = [trade('buy', 'inst-1', { quantity: 100, amount: -250 })]
    // Pence, which no FX provider quotes: scaling it on a guess would be a
    // hundredfold error either way.
    priceOn('LGEN.L', 250, 0, 'GBp')

    const { result } = await loadPortfolio()

    const position = positionOf(result.current.positions, 'inst-1')
    expect(position.close).toBeNull()
    expect(position.marketValue).toBeNull()
    expect(position.status).toBe('unpriced')
    expect(result.current.summary.missingPrices).toEqual(['inst-1'])
  })

  it('asks the user for a symbol rather than showing a holding as worthless', async () => {
    mocks.instruments = [instrument('inst-1', 'Unknown ETF', { symbol: undefined })]
    mocks.trades = [trade('buy', 'inst-1', { quantity: 10, amount: -1000 })]

    const { result } = await loadPortfolio()

    const position = positionOf(result.current.positions, 'inst-1')
    expect(position.status).toBe('needs-symbol')
    expect(position.marketValue).toBeNull()
    expect(result.current.needsSymbol.map(entry => entry._id)).toEqual(['inst-1'])
    // Withheld from the totals, not counted as a loss of the whole basis.
    expect(result.current.summary.marketValue).toBe(0)
    expect(result.current.summary.cost).toBe(0)
    expect(result.current.summary.missingPrices).toEqual(['inst-1'])
  })

  it('keeps a sold-out holding, with the gain it made and no price to ask for', async () => {
    mocks.instruments = [instrument('inst-1', 'Sold ETF')]
    mocks.trades = [
      trade('buy', 'inst-1', { quantity: 10, amount: -1000, daysAgo: 60 }),
      trade('sell', 'inst-1', { quantity: 10, amount: 1300, daysAgo: 10 }),
      trade('dividend', 'inst-1', { amount: 25, daysAgo: 20 }),
    ]

    const { result } = await loadPortfolio()

    expect(positionOf(result.current.positions, 'inst-1')).toMatchObject({
      status: 'closed',
      quantity: 0,
      realised: 300,
      dividends: 25,
      marketValue: 0,
      totalReturn: 325,
    })
    expect(mocks.symbolRequests).toEqual([])
    expect(result.current.summary.totalReturn).toBe(325)
  })

  it('shows what is held now first, largest by value, with history behind it', async () => {
    mocks.instruments = [
      instrument('inst-1', 'Small'),
      instrument('inst-2', 'Large'),
      instrument('inst-3', 'Sold'),
    ]
    mocks.trades = [
      trade('buy', 'inst-1', { quantity: 1, amount: -100 }),
      trade('buy', 'inst-2', { quantity: 10, amount: -1000 }),
      trade('buy', 'inst-3', { quantity: 5, amount: -500, daysAgo: 60 }),
      trade('sell', 'inst-3', { quantity: 5, amount: 900, daysAgo: 10 }),
    ]
    priceOn('INST-1.DE', 100)
    priceOn('INST-2.DE', 100)

    const { result } = await loadPortfolio()

    expect(result.current.positions.map(position => position.instrumentId)).toEqual([
      'inst-2',
      'inst-1',
      'inst-3',
    ])
  })

  it('prices a holding from the cache without asking the server', async () => {
    mocks.instruments = [instrument('inst-1', 'Invesco FTSE All-World')]
    mocks.trades = [trade('buy', 'inst-1', { quantity: 10, amount: -1000 })]
    await cacheClose('INST-1.DE', 118, 1)

    const { result } = await loadPortfolio()

    expect(positionOf(result.current.positions, 'inst-1').close).toBe(118)
    expect(mocks.symbolRequests).toEqual([])
  })

  it('shows the cached close while an aged tip is refreshed, then the new one', async () => {
    mocks.instruments = [instrument('inst-1', 'Invesco FTSE All-World')]
    mocks.trades = [trade('buy', 'inst-1', { quantity: 10, amount: -1000 })]
    await cacheClose('INST-1.DE', 118, 1, Date.now() - TIP_TTL_MS - 1)
    mocks.pending = deferred<PricesResponse>()

    const { result } = await loadPortfolio()

    expect(positionOf(result.current.positions, 'inst-1').close).toBe(118)
    await waitFor(() => expect(mocks.symbolRequests).toEqual([['INST-1.DE']]))

    await act(async () => {
      mocks.pending?.resolve({ 'INST-1.DE': { currency: 'EUR', closes: { [dayKey()]: 120 } } })
    })

    await waitFor(() => expect(positionOf(result.current.positions, 'inst-1').close).toBe(120))
  })

  // The hazard this hook was written around: a read keyed on the symbol array
  // rather than on its contents is a new key on every render, forever.
  it('asks the price feed once and does not ask again on a re-render', async () => {
    mocks.instruments = [instrument('inst-1', 'Invesco FTSE All-World')]
    mocks.trades = [trade('buy', 'inst-1', { quantity: 10, amount: -1000 })]
    priceOn('INST-1.DE', 120)

    const { rerender } = await loadPortfolio()

    await rerender()
    await rerender()

    expect(mocks.symbolRequests).toEqual([['INST-1.DE']])
  })

  it('does not ask again when the trades are rebuilt with the same holdings', async () => {
    mocks.instruments = [instrument('inst-1', 'Invesco FTSE All-World')]
    mocks.trades = [trade('buy', 'inst-1', { quantity: 10, amount: -1000 })]
    priceOn('INST-1.DE', 120)

    const { rerender } = await loadPortfolio()

    // A live query hands back a fresh array whenever anything in Dexie changes,
    // holdings unchanged.
    mocks.trades = [...mocks.trades]
    await rerender()

    expect(mocks.symbolRequests).toEqual([['INST-1.DE']])
  })

  it('asks again once a new holding needs a price, and only for that holding', async () => {
    mocks.instruments = [instrument('inst-1', 'First'), instrument('inst-2', 'Second')]
    mocks.trades = [trade('buy', 'inst-1', { quantity: 10, amount: -1000 })]
    priceOn('INST-1.DE', 120)

    const { rerender, result } = await loadPortfolio()

    mocks.trades = [...mocks.trades, trade('buy', 'inst-2', { quantity: 1, amount: -50 })]
    priceOn('INST-2.DE', 60)
    await rerender()
    await waitFor(() => expect(positionOf(result.current.positions, 'inst-2').close).toBe(60))

    // The first holding's close is cached and fresh, so the server hears only
    // about the new one.
    expect(mocks.symbolRequests).toEqual([['INST-1.DE'], ['INST-2.DE']])
  })

  it('holds the last valuation while a new holding is priced', async () => {
    mocks.instruments = [instrument('inst-1', 'First'), instrument('inst-2', 'Second')]
    mocks.trades = [trade('buy', 'inst-1', { quantity: 10, amount: -1000 })]
    priceOn('INST-1.DE', 120)

    const { rerender, result } = await loadPortfolio()

    mocks.pending = deferred<PricesResponse>()
    mocks.trades = [...mocks.trades, trade('buy', 'inst-2', { quantity: 1, amount: -50 })]
    await rerender()
    await waitFor(() => expect(mocks.symbolRequests).toEqual([['INST-1.DE'], ['INST-2.DE']]))

    // The new row is on screen at once, unpriced, beside the old one's value;
    // nothing was withheld and nothing fell back.
    expect(positionOf(result.current.positions, 'inst-1').close).toBe(120)
    expect(positionOf(result.current.positions, 'inst-2').status).toBe('unpriced')
    expect(screen.queryByTestId('fallback')).toBeNull()

    await act(async () => {
      mocks.pending?.resolve({ 'INST-2.DE': { currency: 'EUR', closes: { [dayKey()]: 60 } } })
    })

    await waitFor(() => expect(positionOf(result.current.positions, 'inst-2').close).toBe(60))
    expect(positionOf(result.current.positions, 'inst-1').close).toBe(120)
  })

  it('leaves a holding unpriced when the server has nothing, without suspending twice', async () => {
    mocks.instruments = [instrument('inst-1', 'Delisted')]
    mocks.trades = [trade('buy', 'inst-1', { quantity: 10, amount: -1000 })]

    const { rerender, result } = await loadPortfolio()

    expect(positionOf(result.current.positions, 'inst-1').status).toBe('unpriced')
    expect(mocks.symbolRequests).toEqual([['INST-1.DE']])

    // An empty answer is an answer: the question is on record, so a re-render
    // neither asks again nor waits.
    await rerender()

    expect(screen.queryByTestId('fallback')).toBeNull()
    expect(mocks.symbolRequests).toEqual([['INST-1.DE']])
  })

  it('has nothing to wait for when no holding needs a price', async () => {
    const { result } = await renderHookSuspended(() => usePortfolio())

    expect(result.current.positions).toEqual([])
    expect(mocks.symbolRequests).toEqual([])
  })

  it('asks for a rate on every currency it has to convert', async () => {
    mocks.rates = new Map([['USD', 1.1]])
    mocks.instruments = [instrument('inst-1', 'Vanguard S&P 500', { currency: 'USD', symbol: 'VUAA' })]
    mocks.trades = [trade('buy', 'inst-1', { quantity: 4, amount: -400, currency: 'USD' })]
    priceOn('VUAA', 110, 0, 'USD')

    await loadPortfolio()

    const requested = mocks.currencyRequests[mocks.currencyRequests.length - 1]
    expect(requested).toContain('USD')
  })

  // Read after the prices rather than beside them, the rates would not be
  // asked for until the prices had answered, and a cold start would wait out
  // both round trips one after the other.
  it('asks for its rates while the prices are still on their way', async () => {
    mocks.instruments = [instrument('inst-1', 'Vanguard S&P 500', { currency: 'USD', symbol: 'VUAA' })]
    mocks.trades = [trade('buy', 'inst-1', { quantity: 4, amount: -400, currency: 'USD' })]
    mocks.pending = deferred<PricesResponse>()

    await renderHookSuspended(() => usePortfolio())

    // Still suspended on the price feed: nothing has read the rates yet, and
    // the read for them is already out.
    expect(screen.getByTestId('fallback')).toBeInTheDocument()
    expect(mocks.currencyRequests).toEqual([])
    expect(mocks.preloadedCurrencies[0]).toEqual(['USD'])

    await act(async () => {
      mocks.pending?.resolve({})
    })
  })

  it('asks for the quote currencies of what is held, not of every symbol ever cached', async () => {
    mocks.rates = new Map([['USD', 1.1]])
    mocks.instruments = [instrument('inst-1', 'Vanguard S&P 500')]
    mocks.trades = [trade('buy', 'inst-1', { quantity: 4, amount: -400 })]
    priceOn('INST-1.DE', 110, 0, 'USD')

    const { result } = await loadPortfolio()

    expect(positionOf(result.current.positions, 'inst-1').quoteCurrency).toBe('USD')
    expect(mocks.currencyRequests[mocks.currencyRequests.length - 1]).toEqual(['EUR', 'USD'])
  })
})
