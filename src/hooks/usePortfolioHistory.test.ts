import { renderHook } from '@testing-library/react'
import { subDays } from 'date-fns'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePortfolioHistory } from './usePortfolioHistory'
import { RATE_LOOKBACK_DAYS } from '@/lib/currency-conversion'
import type { CachedCloses } from '@/lib/market-data-client'
import type { UseExchangeRatesParams } from './useExchangeRates'
import type { Instrument } from '../../shared/schemas/instrument.schema'
import type { Trade, TradeKind } from '../../shared/schemas/trade.schema'

interface ClosesRequest {
  symbolsKey: string
  from: Date | null
  to: Date
}

const mocks = vi.hoisted(() => ({
  trades: [] as Trade[],
  instruments: [] as Instrument[],
  closes: { closes: new Map<string, number>(), currencies: new Map<string, string>() } as CachedCloses,
  rates: new Map<string, number>(),
  closesRequests: [] as ClosesRequest[],
  ratesRequests: [] as UseExchangeRatesParams[],
  /** What was started before anything was read, in order. */
  closesPreloads: [] as ClosesRequest[],
  ratesPreloads: [] as UseExchangeRatesParams[],
}))

vi.mock('./useLiveTrades', () => ({
  useLiveTrades: () => mocks.trades,
}))

vi.mock('./useLiveInstruments', () => ({
  useLiveInstruments: () => mocks.instruments,
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { settings: { defaultCurrency: 'EUR' } } }),
}))

vi.mock('./useCloses', () => ({
  useCloses: (symbolsKey: string, from: Date | null, to: Date) => {
    mocks.closesRequests.push({ symbolsKey, from, to })
    return mocks.closes
  },
  preloadCloses: (symbolsKey: string, from: Date | null, to: Date) => {
    mocks.closesPreloads.push({ symbolsKey, from, to })
  },
}))

vi.mock('./useExchangeRates', () => ({
  useExchangeRates: (params: UseExchangeRatesParams) => {
    mocks.ratesRequests.push(params)
    return mocks.rates
  },
  preloadExchangeRates: (params: UseExchangeRatesParams) => {
    mocks.ratesPreloads.push(params)
  },
}))

function dayKey(daysAgo: number): string {
  const day = new Date()
  day.setUTCDate(day.getUTCDate() - daysAgo)
  return day.toISOString().split('T')[0]
}

/** One close a day for the whole run, so no day is left to forward-fill. */
function priceDaily(symbol: string, close: number, fromDaysAgo: number, currency = 'EUR') {
  for (let daysAgo = fromDaysAgo; daysAgo >= 0; daysAgo--) {
    mocks.closes.closes.set(`${symbol}:${dayKey(daysAgo)}`, close)
  }
  mocks.closes.currencies.set(symbol, currency)
}

let tradeCount = 0

function trade(
  kind: TradeKind,
  instrumentId: string,
  fields: { quantity?: number, amount: number, currency?: string, daysAgo: number }
): Trade {
  tradeCount++
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - fields.daysAgo)

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

function instrument(id: string, overrides: Partial<Instrument> = {}): Instrument {
  return {
    _id: id,
    type: 'instrument',
    name: id,
    currency: 'EUR',
    kind: 'etf',
    symbol: `${id.toUpperCase()}.DE`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

const lastOf = <T,>(list: T[]): T => list[list.length - 1]

beforeEach(() => {
  mocks.trades = []
  mocks.instruments = []
  mocks.closes = { closes: new Map(), currencies: new Map() }
  mocks.rates = new Map()
  mocks.closesRequests = []
  mocks.ratesRequests = []
  mocks.closesPreloads = []
  mocks.ratesPreloads = []
  tradeCount = 0
})

describe('usePortfolioHistory', () => {
  it('has nothing to draw, and nothing to ask for, before the first trade', () => {
    const { result } = renderHook(() => usePortfolioHistory())

    expect(result.current.points).toEqual([])
    expect(result.current.unpriced).toEqual([])
    expect(result.current.baseCurrency).toBe('EUR')
    expect(lastOf(mocks.closesRequests)).toMatchObject({ symbolsKey: '', from: null })
    expect(lastOf(mocks.ratesRequests).targetCurrencies).toEqual([])
  })

  it('prices every symbol ever held from the first trade to today, sold ones included', () => {
    mocks.instruments = [instrument('inst-1'), instrument('inst-2')]
    mocks.trades = [
      trade('buy', 'inst-1', { quantity: 10, amount: -1000, daysAgo: 60 }),
      trade('sell', 'inst-1', { quantity: 10, amount: 1200, daysAgo: 10 }),
      trade('buy', 'inst-2', { quantity: 2, amount: -100, daysAgo: 30 }),
    ]
    priceDaily('INST-1.DE', 110, 60)
    priceDaily('INST-2.DE', 60, 60)

    const { result } = renderHook(() => usePortfolioHistory())

    const request = lastOf(mocks.closesRequests)
    expect(request.symbolsKey).toBe('INST-1.DE,INST-2.DE')
    expect(request.from?.toISOString()).toBe(mocks.trades[0].date)
    expect(request.to).toBe(result.current.asOf)

    expect(result.current.points[0].date).toBe(dayKey(60))
    expect(lastOf(result.current.points).date).toBe(dayKey(0))
    expect(lastOf(result.current.points).value).toBe(120)
    expect(result.current.unpriced).toEqual([])
  })

  it('asks for a rate on every currency the curve converts, quote currencies included', () => {
    mocks.instruments = [instrument('inst-1', { currency: 'USD' })]
    mocks.trades = [trade('buy', 'inst-1', { quantity: 10, amount: -1000, currency: 'USD', daysAgo: 30 })]
    // Quoted in a third currency: the close has to be restated before it can
    // value a holding kept in another.
    priceDaily('INST-1.DE', 95, 30, 'GBP')

    const { result } = renderHook(() => usePortfolioHistory())

    const request = lastOf(mocks.ratesRequests)
    expect(request.baseCurrency).toBe('EUR')
    expect(request.targetCurrencies).toEqual(['GBP', 'USD'])
    expect(request.startDate).toEqual(subDays(new Date(mocks.trades[0].date), RATE_LOOKBACK_DAYS))
    expect(request.endDate).toBe(result.current.asOf)
  })

  // The quote currencies are only known once the closes are, so the rates read
  // that waits for them is started here off what the trades already say: read
  // in turn, a cold start would pay the two round trips end to end.
  it('starts the closes and the rates together rather than one after the other', () => {
    mocks.instruments = [instrument('inst-1', { currency: 'USD' })]
    mocks.trades = [trade('buy', 'inst-1', { quantity: 10, amount: -1000, currency: 'USD', daysAgo: 30 })]
    priceDaily('INST-1.DE', 95, 30, 'GBP')

    renderHook(() => usePortfolioHistory())

    const closes = lastOf(mocks.closesPreloads)
    expect(closes.symbolsKey).toBe('INST-1.DE')
    expect(closes.from?.toISOString()).toBe(mocks.trades[0].date)

    const rates = lastOf(mocks.ratesPreloads)
    expect(rates.baseCurrency).toBe('EUR')
    expect(rates.targetCurrencies).toEqual(['USD'])
    expect(rates.startDate).toEqual(subDays(new Date(mocks.trades[0].date), RATE_LOOKBACK_DAYS))
  })

  it('names the holdings it could not price rather than dropping them quietly', () => {
    mocks.instruments = [instrument('inst-1'), instrument('inst-2')]
    mocks.trades = [
      trade('buy', 'inst-1', { quantity: 10, amount: -1000, daysAgo: 30 }),
      trade('buy', 'inst-2', { quantity: 1, amount: -50, daysAgo: 30 }),
    ]
    priceDaily('INST-1.DE', 110, 30)

    const { result } = renderHook(() => usePortfolioHistory())

    expect(result.current.unpriced.map(entry => entry._id)).toEqual(['inst-2'])
    expect(lastOf(result.current.points).value).toBe(1100)
  })
})
