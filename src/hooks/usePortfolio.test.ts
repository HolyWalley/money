import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePortfolio } from './usePortfolio'
import type { CachedCloses } from '@/lib/market-data-client'
import type { Instrument } from '../../shared/schemas/instrument.schema'
import type { Trade, TradeKind } from '../../shared/schemas/trade.schema'

interface Deferred {
  promise: Promise<CachedCloses>
  resolve: (closes: CachedCloses) => void
}

const mocks = vi.hoisted(() => ({
  trades: [] as Trade[],
  instruments: [] as Instrument[],
  /** Units of the currency per one unit of the base, as the rate service quotes them. */
  rates: new Map<string, number>(),
  isLoadingRates: false,
  closes: new Map<string, number>(),
  quoteCurrencies: new Map<string, string>(),
  symbolRequests: [] as string[][],
  currencyRequests: [] as string[][],
  /** Set to hold the answer back, so a fetch still in flight can be observed. */
  pending: null as Deferred | null,
}))

vi.mock('./useLiveTrades', () => ({
  useLiveTrades: () => ({ trades: mocks.trades, isLoading: false }),
}))

vi.mock('./useLiveInstruments', () => ({
  useLiveInstruments: () => ({ instruments: mocks.instruments, isLoading: false }),
}))

vi.mock('./useCurrentRates', () => ({
  useCurrentRates: (currencies: string[]) => {
    mocks.currencyRequests.push(currencies)
    return {
      convert: (amount: number, currency: string) => {
        if (currency === 'EUR') return amount
        const rate = mocks.rates.get(currency)
        return rate === undefined ? null : amount / rate
      },
      baseCurrency: 'EUR',
      isLoading: mocks.isLoadingRates,
    }
  },
}))

vi.mock('@/lib/market-data-client', () => ({
  marketDataClient: {
    getCloses: (symbols: string[]) => {
      mocks.symbolRequests.push(symbols)
      if (mocks.pending) return mocks.pending.promise
      return Promise.resolve({ closes: mocks.closes, currencies: mocks.quoteCurrencies })
    },
  },
}))

function deferred(): Deferred {
  let resolve!: (closes: CachedCloses) => void
  const promise = new Promise<CachedCloses>(settle => {
    resolve = settle
  })
  return { promise, resolve }
}

function dayKey(daysAgo = 0): string {
  const day = new Date()
  day.setUTCDate(day.getUTCDate() - daysAgo)
  return day.toISOString().split('T')[0]
}

function priceOn(symbol: string, close: number, daysAgo = 0) {
  mocks.closes.set(`${symbol}:${dayKey(daysAgo)}`, close)
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
  const rendered = renderHook(() => usePortfolio())
  await waitFor(() => expect(rendered.result.current.isLoading).toBe(false))
  return rendered
}

function positionOf(positions: ReturnType<typeof usePortfolio>['positions'], instrumentId: string) {
  const position = positions.find(entry => entry.instrumentId === instrumentId)
  if (!position) throw new Error(`no position for ${instrumentId}`)
  return position
}

beforeEach(() => {
  mocks.trades = []
  mocks.instruments = []
  mocks.rates = new Map()
  mocks.isLoadingRates = false
  mocks.closes = new Map()
  mocks.quoteCurrencies = new Map()
  mocks.symbolRequests = []
  mocks.currencyRequests = []
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
    mocks.quoteCurrencies = new Map([['VUAA', 'USD']])
    priceOn('VUAA', 110)

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
    mocks.quoteCurrencies = new Map([['INST-1.DE', 'USD']])
    priceOn('INST-1.DE', 125)

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
    mocks.quoteCurrencies = new Map([['LGEN.L', 'GBp']])
    priceOn('LGEN.L', 250)

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

  // The hazard this hook was written around: an effect keyed on the symbol
  // array rather than on its contents refetches on every render, forever.
  it('asks the price feed once and does not ask again on a re-render', async () => {
    mocks.instruments = [instrument('inst-1', 'Invesco FTSE All-World')]
    mocks.trades = [trade('buy', 'inst-1', { quantity: 10, amount: -1000 })]
    priceOn('INST-1.DE', 120)

    const { rerender } = await loadPortfolio()

    rerender()
    rerender()

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
    rerender()

    expect(mocks.symbolRequests).toEqual([['INST-1.DE']])
  })

  it('asks again once a new holding needs a price', async () => {
    mocks.instruments = [instrument('inst-1', 'First'), instrument('inst-2', 'Second')]
    mocks.trades = [trade('buy', 'inst-1', { quantity: 10, amount: -1000 })]
    priceOn('INST-1.DE', 120)

    const { rerender, result } = await loadPortfolio()

    mocks.trades = [...mocks.trades, trade('buy', 'inst-2', { quantity: 1, amount: -50 })]
    priceOn('INST-2.DE', 60)
    rerender()
    await waitFor(() => expect(result.current.positions).toHaveLength(2))

    expect(mocks.symbolRequests).toEqual([['INST-1.DE'], ['INST-1.DE', 'INST-2.DE']])
  })

  it('waits while the closes are still in flight', async () => {
    mocks.instruments = [instrument('inst-1', 'Invesco FTSE All-World')]
    mocks.trades = [trade('buy', 'inst-1', { quantity: 10, amount: -1000 })]
    mocks.pending = deferred()

    const { result } = renderHook(() => usePortfolio())

    expect(result.current.isLoading).toBe(true)

    mocks.pending.resolve({ closes: mocks.closes, currencies: mocks.quoteCurrencies })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  it('has nothing to wait for when no holding needs a price', async () => {
    const { result } = renderHook(() => usePortfolio())

    expect(result.current.isLoading).toBe(false)
    expect(mocks.symbolRequests).toEqual([])
  })

  it('asks for a rate on every currency it has to convert', async () => {
    mocks.rates = new Map([['USD', 1.1]])
    mocks.instruments = [instrument('inst-1', 'Vanguard S&P 500', { currency: 'USD', symbol: 'VUAA' })]
    mocks.trades = [trade('buy', 'inst-1', { quantity: 4, amount: -400, currency: 'USD' })]
    mocks.quoteCurrencies = new Map([['VUAA', 'USD']])
    priceOn('VUAA', 110)

    await loadPortfolio()

    const requested = mocks.currencyRequests[mocks.currencyRequests.length - 1]
    expect(requested).toContain('USD')
  })
})
