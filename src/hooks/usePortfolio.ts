import { useEffect, useMemo, useState } from 'react'
import { useLiveTrades } from './useLiveTrades'
import { useLiveInstruments } from './useLiveInstruments'
import { useCurrentRates } from './useCurrentRates'
import {
  computePositions,
  summarizePortfolio,
  type PortfolioSummary,
  type Position,
  type PriceLookup,
} from '@/lib/positions'
import { marketDataClient, type CachedCloses } from '@/lib/market-data-client'
import type { Converter } from '@/lib/currency-conversion'
import { findClose } from '../../shared/market-data'
import type { Instrument } from '../../shared/schemas/instrument.schema'

/**
 * Why a row shows the value it shows - or why it shows none.
 *
 * 'needs-symbol' is deliberately separate from 'unpriced': an instrument whose
 * price feed was never resolved cannot be valued at all, and the user can fix
 * that in a way they cannot fix a provider outage.
 */
export type PositionStatus = 'priced' | 'closed' | 'needs-symbol' | 'unpriced' | 'unquantified'

export interface PortfolioPosition extends Position {
  /** Absent only when the trades outlived the instrument record they name. */
  instrument?: Instrument
  /** The market-data symbol the close was read from, once resolved. */
  symbol?: string
  /** What the feed quotes that symbol in, which is not always the position's currency. */
  quoteCurrency?: string
  /** Latest close, restated into the position's currency; null when unknown. */
  close: number | null
  /** quantity x close, in the position's currency. */
  marketValue: number | null
  /** marketValue - cost, in the position's currency. */
  unrealised: number | null
  /** unrealised + realised + dividends, in the position's currency. */
  totalReturn: number | null
  /** marketValue in the base currency; null when no rate reaches it. */
  marketValueInBase: number | null
  status: PositionStatus
}

export interface UsePortfolioResult {
  /** Open holdings first, largest by value, then everything closed. */
  positions: PortfolioPosition[]
  summary: PortfolioSummary
  /**
   * Instruments held right now whose price feed was never resolved. They are
   * the subset of `summary.missingPrices` a user can do something about, and
   * what SymbolPicker exists to fix.
   */
  needsSymbol: Instrument[]
  baseCurrency: string | undefined
  /** The instant every close and rate above was read as of. */
  asOf: Date
  isLoading: boolean
}

const EMPTY_CLOSES: CachedCloses = { closes: new Map(), currencies: new Map() }

interface PricedCloses {
  /** The symbol list this answer covers, joined and sorted. */
  key: string
  closes: CachedCloses
}

/**
 * A close restated into the currency the position's own figures are kept in.
 *
 * A resolved symbol is not always quoted in the instrument's currency: an LSE
 * line comes back in GBp, and an ISIN search resolves a Xetra holding to its
 * London USD listing just as happily, the two differing by a whole FX rate.
 * Multiplying the quantity by the raw close would report that difference as a
 * gain. Going through the base currency restates it properly, and a quote in a
 * currency no rate reaches - GBp has none - leaves the holding unpriced rather
 * than scaled on a guess.
 */
function restateClose(
  close: number,
  quoteCurrency: string,
  positionCurrency: string,
  convert: Converter
): number | null {
  if (quoteCurrency === positionCurrency) return close

  const closeInBase = convert(close, quoteCurrency)
  const unitInBase = convert(1, positionCurrency)
  if (closeInBase === null || unitInBase === null || unitInBase === 0) return null

  return closeInBase / unitInBase
}

function comparePositions(a: PortfolioPosition, b: PortfolioPosition): number {
  // What is held now comes first: a closed position is history, however large
  // the gain it left behind.
  if (a.isClosed !== b.isClosed) return a.isClosed ? 1 : -1

  const aValue = a.marketValueInBase
  const bValue = b.marketValueInBase
  if (aValue !== bValue) {
    // A holding of unknown value sorts below every known one rather than above
    // them all, which is where a zero would put it.
    if (aValue === null) return 1
    if (bValue === null) return -1
    return bValue - aValue
  }

  return (a.instrument?.name ?? a.instrumentId).localeCompare(b.instrument?.name ?? b.instrumentId)
}

/**
 * Every holding, valued at the latest close and converted into the base
 * currency, plus the portfolio's headline totals.
 *
 * Prices are fetched by symbol, and the fetch is keyed on the joined, sorted
 * symbol list rather than on the array holding it: an array is rebuilt on
 * every render, and an effect keyed on one fetches forever. `asOf` is pinned
 * once for the same reason - a window read from the clock never stops moving.
 */
export function usePortfolio(): UsePortfolioResult {
  const { trades, isLoading: isLoadingTrades } = useLiveTrades()
  const { instruments, isLoading: isLoadingInstruments } = useLiveInstruments()

  const asOf = useMemo(() => new Date(), [])

  const positions = useMemo(() => computePositions(trades), [trades])

  const instrumentById = useMemo(
    () => new Map(instruments.map(instrument => [instrument._id, instrument])),
    [instruments]
  )

  // Only what is still held: a sold-out position is worth nothing whatever the
  // market did next, so asking for its price would be a request per instrument
  // the user ever owned.
  const symbolsKey = useMemo(() => {
    const symbols = new Set<string>()
    for (const [instrumentId, position] of positions) {
      if (position.isClosed) continue
      const symbol = instrumentById.get(instrumentId)?.symbol
      if (symbol) symbols.add(symbol)
    }
    return [...symbols].sort().join(',')
  }, [positions, instrumentById])

  const [priced, setPriced] = useState<PricedCloses>({ key: '', closes: EMPTY_CLOSES })

  useEffect(() => {
    if (!symbolsKey) return

    let cancelled = false

    marketDataClient
      .getCloses(symbolsKey.split(','), asOf, asOf)
      .then(closes => {
        if (!cancelled) setPriced({ key: symbolsKey, closes })
      })
      .catch(error => {
        console.error('Failed to fetch closes:', error)
        // Counted as answered all the same, keeping whatever was cached: the
        // holdings it could not price already say so, and a spinner that never
        // stops tells the user less than a total that admits it is partial.
        if (!cancelled) setPriced(current => ({ key: symbolsKey, closes: current.closes }))
      })

    return () => {
      cancelled = true
    }
  }, [symbolsKey, asOf])

  const { closes } = priced

  const currencies = useMemo(() => {
    const list = [...positions.values()].map(position => position.currency)
    // The quote currencies too: a close in one of them has to be restated
    // before it can value a holding kept in another.
    list.push(...closes.currencies.values())
    return list
  }, [positions, closes])

  const { convert, baseCurrency, isLoading: isLoadingRates } = useCurrentRates(currencies)

  const closeOf = useMemo(
    () => (instrumentId: string, positionCurrency: string) => {
      const symbol = instrumentById.get(instrumentId)?.symbol
      if (!symbol) return null

      const close = findClose(closes.closes, symbol, asOf)
      if (close === null) return null

      return restateClose(close, closes.currencies.get(symbol) ?? positionCurrency, positionCurrency, convert)
    },
    [instrumentById, closes, asOf, convert]
  )

  const priceLookup = useMemo<PriceLookup>(
    () => instrumentId => {
      const position = positions.get(instrumentId)
      return position ? closeOf(instrumentId, position.currency) : null
    },
    [positions, closeOf]
  )

  const summary = useMemo(
    () => summarizePortfolio(positions, priceLookup, convert),
    [positions, priceLookup, convert]
  )

  const enriched = useMemo(() => {
    const rows = [...positions.values()].map<PortfolioPosition>(position => {
      const instrument = instrumentById.get(position.instrumentId)
      const symbol = instrument?.symbol
      const close = closeOf(position.instrumentId, position.currency)

      // A closed holding needs no close: nothing times a price is nothing, and
      // its cost basis was released by the sale that emptied it.
      const marketValue = position.unquantified
        ? null
        : position.isClosed
          ? 0
          : close === null
            ? null
            : close * position.quantity

      const unrealised = marketValue === null ? null : marketValue - position.cost
      const totalReturn = unrealised === null ? null : unrealised + position.realised + position.dividends

      const status: PositionStatus = position.unquantified
        ? 'unquantified'
        : position.isClosed
          ? 'closed'
          : instrument && !symbol
            ? 'needs-symbol'
            : close === null
              ? 'unpriced'
              : 'priced'

      return {
        ...position,
        instrument,
        symbol,
        quoteCurrency: symbol ? closes.currencies.get(symbol) : undefined,
        close,
        marketValue,
        unrealised,
        totalReturn,
        marketValueInBase: marketValue === null ? null : convert(marketValue, position.currency),
        status,
      }
    })

    return rows.sort(comparePositions)
  }, [positions, instrumentById, closes, closeOf, convert])

  const needsSymbol = useMemo(
    () =>
      enriched
        .filter(position => position.status === 'needs-symbol')
        .map(position => position.instrument)
        .filter((instrument): instrument is Instrument => instrument !== undefined),
    [enriched]
  )

  const isLoadingPrices = symbolsKey !== '' && priced.key !== symbolsKey
  const isLoading = isLoadingTrades || isLoadingInstruments || isLoadingRates || isLoadingPrices

  return {
    positions: enriched,
    summary,
    needsSymbol,
    // True until every close and rate is in. The figures below are readable
    // before then, but incomplete - a holding whose price is still in flight
    // reads as unpriced - so a list is better held back until it clears.
    isLoading,
    baseCurrency,
    asOf,
  }
}
