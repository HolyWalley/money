import { useEffect, useMemo, useState } from 'react'
import { subDays } from 'date-fns'
import { useCurrentRates } from './useCurrentRates'
import { useExchangeRates } from './useExchangeRates'
import { useLiveInstruments } from './useLiveInstruments'
import { useLiveTrades } from './useLiveTrades'
import { RATE_LOOKBACK_DAYS, createConverter } from '@/lib/currency-conversion'
import { summariseDividends, type DividendHistory } from '@/lib/dividend-history'
import { marketDataClient, type CachedCloses } from '@/lib/market-data-client'
import {
  buildPortfolioHistory,
  type DailyConverter,
  type HistoryPoint,
} from '@/lib/portfolio-history'
import type { Instrument } from '../../shared/schemas/instrument.schema'

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
  isLoading: boolean
}

const EMPTY_CLOSES: CachedCloses = { closes: new Map(), currencies: new Map() }
const EMPTY_POINTS: HistoryPoint[] = []
const EMPTY_INSTRUMENTS: Instrument[] = []

/** Asked only for the base currency, so there is nothing for it to fetch. */
const NO_CURRENCIES: string[] = []
const NO_DIVIDENDS: DividendHistory = { months: [], missingCurrencies: [] }

interface PricedCloses {
  /** The symbols and the range this answer covers, so a stale one is recognisable. */
  key: string
  closes: CachedCloses
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
  const { baseCurrency } = useCurrentRates(NO_CURRENCIES)

  // Pinned once rather than read from the clock on every render: a window that
  // moves every millisecond never stops refetching.
  const asOf = useMemo(() => new Date(), [])

  const instrumentById = useMemo(
    () => new Map(instruments.map(instrument => [instrument._id, instrument])),
    [instruments]
  )

  /** The first day anything happened, which is where the curve starts. */
  const from = useMemo(() => {
    let earliest = Number.POSITIVE_INFINITY
    for (const trade of trades) {
      const time = Date.parse(trade.date)
      if (!Number.isNaN(time) && time < earliest) earliest = time
    }
    return Number.isFinite(earliest) ? new Date(earliest) : null
  }, [trades])

  // Joined and sorted rather than an array: an array is rebuilt on every
  // render, and an effect keyed on one fetches forever.
  const symbolsKey = useMemo(() => {
    const symbols = new Set<string>()
    for (const trade of trades) {
      if (!trade.instrumentId) continue
      const symbol = instrumentById.get(trade.instrumentId)?.symbol
      if (symbol) symbols.add(symbol)
    }
    return [...symbols].sort().join(',')
  }, [trades, instrumentById])

  const fromKey = from ? from.toISOString().split('T')[0] : ''
  const fetchKey = `${fromKey}|${symbolsKey}`

  const [priced, setPriced] = useState<PricedCloses>({ key: '', closes: EMPTY_CLOSES })

  useEffect(() => {
    if (!symbolsKey || !fromKey) return

    let cancelled = false

    marketDataClient
      .getCloses(symbolsKey.split(','), new Date(`${fromKey}T00:00:00.000Z`), asOf)
      .then(closes => {
        if (!cancelled) setPriced({ key: fetchKey, closes })
      })
      .catch(error => {
        console.error('Failed to fetch the price history:', error)
        // Counted as answered, keeping whatever was cached: the chart says
        // which holdings it could not price, and a spinner that never stops
        // tells the reader less than a curve that admits it is partial.
        if (!cancelled) setPriced(current => ({ key: fetchKey, closes: current.closes }))
      })

    return () => {
      cancelled = true
    }
  }, [fetchKey, symbolsKey, fromKey, asOf])

  const currencies = useMemo(() => {
    const list = new Set<string>()
    for (const trade of trades) list.add(trade.currency)
    for (const instrument of instruments) list.add(instrument.currency)
    // The quote currencies too: a close comes back in whatever the market
    // quotes it in, which is not always the instrument's own currency.
    for (const currency of priced.closes.currencies.values()) list.add(currency)
    return [...list].filter(currency => currency && currency !== baseCurrency).sort()
  }, [trades, instruments, priced, baseCurrency])

  // Reaching RATE_LOOKBACK_DAYS before the first trade, because the day a
  // holding was bought can itself be a weekend for the currency market.
  const ratesFrom = useMemo(() => (from ? subDays(from, RATE_LOOKBACK_DAYS) : undefined), [from])

  const { rates, isLoading: isLoadingRates } = useExchangeRates({
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
      quoteCurrencyOf: symbol => priced.closes.currencies.get(symbol),
      closes: priced.closes.closes,
      convertOn,
      from,
      to: asOf,
    })
  }, [trades, instrumentById, priced, convertOn, from, asOf, baseCurrency])

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
    isLoading: isLoadingRates || (symbolsKey !== '' && priced.key !== fetchKey),
  }
}
