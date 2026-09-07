import { useMemo } from 'react'
import { subDays } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'
import { preloadCloses, useCloses } from './useCloses'
import { preloadExchangeRates, useExchangeRates } from './useExchangeRates'
import { useLiveInstruments } from './useLiveInstruments'
import { useLiveTrades } from './useLiveTrades'
import { RATE_LOOKBACK_DAYS, createConverter } from '@/lib/currency-conversion'
import { summariseDividends, type DividendHistory } from '@/lib/dividend-history'
import {
  buildPortfolioHistory,
  type DailyConverter,
  type HistoryPoint,
} from '@/lib/portfolio-history'
import type { Instrument } from '../../shared/schemas/instrument.schema'
import type { Trade } from '../../shared/schemas/trade.schema'

export interface UsePortfolioHistoryResult {
  /** One point per calendar day from the first trade to today, oldest first. */
  points: HistoryPoint[]
  /** Holdings the curve had to leave out, named so the chart can say so. */
  unpriced: Instrument[]
  /**
   * What was paid out month by month, off the same rates the curve uses. Here
   * rather than in a hook of its own so that one set of daily rates answers
   * both, instead of two components asking the provider for the same years.
   */
  dividends: DividendHistory
  baseCurrency: string | undefined
  /**
   * An amount in any currency, in the base as of any day. Shared so that
   * anything else reading the same history - a list of what was paid, say -
   * states each figure at the rate of the day it happened, off one set of rates.
   */
  convertOn: DailyConverter
  /** The day the history ends on, pinned once so a window cannot drift. */
  asOf: Date
}

const EMPTY_POINTS: HistoryPoint[] = []
const EMPTY_INSTRUMENTS: Instrument[] = []
const NO_DIVIDENDS: DividendHistory = { months: [], missingCurrencies: [] }
const NO_QUOTE_CURRENCIES: string[] = []

function instrumentsById(instruments: Instrument[]): Map<string, Instrument> {
  return new Map(instruments.map(instrument => [instrument._id, instrument]))
}

/** The first day anything happened, which is where the curve starts. */
function firstTradeDay(trades: Trade[]): Date | null {
  let earliest = Number.POSITIVE_INFINITY
  for (const trade of trades) {
    const time = Date.parse(trade.date)
    if (!Number.isNaN(time) && time < earliest) earliest = time
  }
  return Number.isFinite(earliest) ? new Date(earliest) : null
}

/**
 * Every symbol ever held, joined and sorted rather than an array: an array is
 * rebuilt on every render, and a key made from one is a new key every time.
 */
function tradedSymbolsKey(trades: Trade[], instrumentById: Map<string, Instrument>): string {
  const symbols = new Set<string>()
  for (const trade of trades) {
    if (!trade.instrumentId) continue
    const symbol = instrumentById.get(trade.instrumentId)?.symbol
    if (symbol) symbols.add(symbol)
  }
  return [...symbols].sort().join(',')
}

/** Every currency the curve has to convert, the quote currencies included. */
function convertedCurrencies(
  trades: Trade[],
  instruments: Instrument[],
  quoteCurrencies: Iterable<string>,
  baseCurrency: string | undefined
): string[] {
  const list = new Set<string>()
  for (const trade of trades) list.add(trade.currency)
  for (const instrument of instruments) list.add(instrument.currency)
  // The quote currencies too: a close comes back in whatever the market
  // quotes it in, which is not always the instrument's own currency.
  for (const currency of quoteCurrencies) list.add(currency)
  return [...list].filter(currency => currency && currency !== baseCurrency).sort()
}

// Reaching RATE_LOOKBACK_DAYS before the first trade, because the day a
// holding was bought can itself be a weekend for the currency market.
const ratesStart = (from: Date): Date => subDays(from, RATE_LOOKBACK_DAYS)

/**
 * Starts the closes and the rates the curve will read, without reading either.
 *
 * A page that reads the positions first would not begin the curve's own reads
 * until those had answered, and a cold start would pay every round trip end to
 * end. The quote currencies are not known before the closes are; the rates key
 * the hook settles on finds what this asked for already cached.
 */
export function preloadPortfolioHistory(
  trades: Trade[],
  instruments: Instrument[],
  baseCurrency: string | undefined,
  asOf: Date
): void {
  const from = firstTradeDay(trades)
  if (!from) return

  preloadCloses(tradedSymbolsKey(trades, instrumentsById(instruments)), from, asOf)
  preloadExchangeRates({
    baseCurrency,
    targetCurrencies: convertedCurrencies(trades, instruments, NO_QUOTE_CURRENCIES, baseCurrency),
    startDate: ratesStart(from),
    endDate: asOf,
  })
}

/** `preloadPortfolioHistory` for a page that reads the curve further down. */
export function usePreloadPortfolioHistory(): void {
  const trades = useLiveTrades()
  const instruments = useLiveInstruments()
  const { user } = useAuth()
  const asOf = useMemo(() => new Date(), [])

  preloadPortfolioHistory(trades, instruments, user?.settings?.defaultCurrency, asOf)
}

/**
 * The portfolio's whole history, day by day.
 *
 * Every symbol ever held is priced over the whole range, not just what is held
 * now: a holding sold last year was worth something on the days it was held,
 * and a curve that priced only today's holdings would report the past as
 * emptier than it was.
 */
export function usePortfolioHistory(): UsePortfolioHistoryResult {
  const trades = useLiveTrades()
  const instruments = useLiveInstruments()
  const { user } = useAuth()
  const baseCurrency = user?.settings?.defaultCurrency

  // Pinned once rather than read from the clock on every render: a window that
  // moves every millisecond is a new key every render.
  const asOf = useMemo(() => new Date(), [])

  const instrumentById = useMemo(() => instrumentsById(instruments), [instruments])

  const from = useMemo(() => firstTradeDay(trades), [trades])

  const symbolsKey = useMemo(() => tradedSymbolsKey(trades, instrumentById), [trades, instrumentById])

  // The rates are asked for here rather than after the closes have answered,
  // so the two run together on a cold start.
  preloadPortfolioHistory(trades, instruments, baseCurrency, asOf)

  const closes = useCloses(symbolsKey, from, asOf)

  const currencies = useMemo(
    () => convertedCurrencies(trades, instruments, closes.currencies.values(), baseCurrency),
    [trades, instruments, closes, baseCurrency]
  )

  const ratesFrom = useMemo(() => (from ? ratesStart(from) : undefined), [from])

  const rates = useExchangeRates({
    baseCurrency,
    targetCurrencies: currencies,
    startDate: ratesFrom,
    endDate: asOf,
  })

  const convertOn = useMemo<DailyConverter>(
    () => (amount, currency, onDate) => createConverter(rates, baseCurrency, onDate)(amount, currency),
    [rates, baseCurrency]
  )

  const history = useMemo(() => {
    if (!from || !baseCurrency) return null

    return buildPortfolioHistory({
      trades,
      symbolOf: instrumentId => instrumentById.get(instrumentId)?.symbol,
      quoteCurrencyOf: symbol => closes.currencies.get(symbol),
      closes: closes.closes,
      convertOn,
      from,
      to: asOf,
    })
  }, [trades, instrumentById, closes, convertOn, from, asOf, baseCurrency])

  const unpriced = useMemo(() => {
    if (!history) return EMPTY_INSTRUMENTS
    return history.unpriced
      .map(instrumentId => instrumentById.get(instrumentId))
      .filter((instrument): instrument is Instrument => Boolean(instrument))
  }, [history, instrumentById])

  const dividends = useMemo(
    () => (baseCurrency ? summariseDividends(trades, convertOn) : NO_DIVIDENDS),
    [trades, convertOn, baseCurrency]
  )

  return {
    points: history?.points ?? EMPTY_POINTS,
    unpriced,
    dividends,
    baseCurrency,
    convertOn,
    asOf,
  }
}
