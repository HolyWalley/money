import { useCallback, useEffect, useMemo, useState } from 'react'
import { subDays } from 'date-fns'
import { marketDataClient, searchSymbols } from '@/lib/market-data-client'
import {
  CLOSE_LOOKBACK_DAYS,
  findClose,
  rankCandidatesByTradePrice,
  type InstrumentCandidate,
  type RankedCandidate,
} from '../../shared/market-data'
import type { Instrument } from '../../shared/schemas/instrument.schema'

/** A price the instrument actually traded at, and the session it traded in. */
export interface SymbolReference {
  price: number
  /** ISO 8601 date of the trade the price came from. */
  date: string
}

export interface UseSymbolCandidatesOptions {
  instrument: Instrument
  reference?: SymbolReference
  /** Searching is skipped while false, so a closed picker costs nothing. */
  enabled?: boolean
}

export interface UseSymbolCandidatesResult {
  query: string
  setQuery: (query: string) => void
  /** Best evidence first when ranked; otherwise the provider's own order. */
  candidates: RankedCandidate[]
  /**
   * Whether the order above is evidence or merely the provider's guess. False
   * when no trade price could be compared against - the candidates are still
   * listed, but nothing about the list recommends one.
   */
  isRanked: boolean
  isLoading: boolean
  /** Set when the search itself failed, which is not the same as finding nothing. */
  error: string | null
  retry: () => void
}

const SEARCH_DEBOUNCE_MS = 300

/** The worker rejects anything shorter, so sending it only spends a round trip. */
const MIN_QUERY_LENGTH = 2

const SEARCH_FAILED = 'Could not reach the symbol search.'

const NO_CLOSES: ReadonlyMap<string, number | null> = new Map()

interface SearchState {
  key: string
  results: InstrumentCandidate[]
  error: string | null
}

interface PricedState {
  key: string
  closes: ReadonlyMap<string, number | null>
}

/**
 * ISIN first: it names the security across every listing, where a ticker means
 * different things on different exchanges and a name means nothing to a feed.
 */
function seedQueryFor(instrument: Instrument): string {
  return instrument.isin || instrument.ticker || instrument.name
}

function unranked(candidates: InstrumentCandidate[]): RankedCandidate[] {
  return candidates.map(candidate => ({ ...candidate, close: null, deviation: null, matches: false }))
}

/**
 * The listings an instrument could be, ordered by the one piece of evidence
 * that separates them: the price it actually traded at.
 *
 * Searching by ISIN answers with SOME listing of the security, and the London
 * USD line and the Xetra EUR line differ by a whole FX rate - so the search
 * order alone would misprice a holding for as long as it is held. Each
 * candidate's close on the trade date is fetched and compared with what was
 * paid; see rankCandidatesByTradePrice.
 *
 * Every effect below keys on a string. `reference` is rebuilt by the caller on
 * every render, and an effect keyed on that object - or on the results array -
 * fetches forever.
 */
export function useSymbolCandidates({
  instrument,
  reference,
  enabled = true,
}: UseSymbolCandidatesOptions): UseSymbolCandidatesResult {
  const seed = seedQueryFor(instrument)

  const [query, setQuery] = useState(seed)
  const [debouncedQuery, setDebouncedQuery] = useState(seed)
  const [attempt, setAttempt] = useState(0)
  const [search, setSearch] = useState<SearchState>({ key: '', results: [], error: null })
  const [priced, setPriced] = useState<PricedState>({ key: '', closes: NO_CLOSES })

  // A different instrument is a different question, so whatever was typed for
  // the last one goes with it.
  useEffect(() => {
    setQuery(seed)
    setDebouncedQuery(seed)
  }, [seed])

  useEffect(() => {
    if (query === debouncedQuery) return

    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, debouncedQuery])

  const trimmedQuery = debouncedQuery.trim()
  const isSearchable = trimmedQuery.length >= MIN_QUERY_LENGTH
  // `attempt` is part of the key so Retry can re-ask a question already
  // answered - the answer was a failure, and only asking again can change it.
  const searchKey = `${attempt}:${trimmedQuery}`

  useEffect(() => {
    if (!enabled) return

    if (!isSearchable) {
      setSearch(current => (current.key === searchKey ? current : { key: searchKey, results: [], error: null }))
      return
    }

    let cancelled = false

    searchSymbols(trimmedQuery)
      .then(results => {
        if (!cancelled) setSearch({ key: searchKey, results, error: null })
      })
      .catch(() => {
        if (!cancelled) setSearch({ key: searchKey, results: [], error: SEARCH_FAILED })
      })

    return () => {
      cancelled = true
    }
  }, [enabled, isSearchable, trimmedQuery, searchKey])

  const symbolsKey = useMemo(
    () => [...new Set(search.results.map(candidate => candidate.symbol))].sort().join(','),
    [search.results]
  )

  const referencePrice = reference?.price
  const referenceDate = reference?.date

  // Memoised on the ISO string, so the Date below is the same object from one
  // render to the next and can be an effect dependency at all.
  const tradeDate = useMemo(() => {
    if (!referenceDate) return null
    const parsed = new Date(referenceDate)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }, [referenceDate])

  const hasReference = tradeDate !== null && referencePrice !== undefined && referencePrice > 0
  const closesKey = hasReference ? `${referenceDate}:${symbolsKey}` : ''
  const needsCloses = hasReference && symbolsKey !== ''

  useEffect(() => {
    if (!needsCloses || tradeDate === null) return

    let cancelled = false
    const symbols = symbolsKey.split(',')

    // Reaching a week back, not just the trade date: a trade dated on a market
    // holiday has no close of its own, and findClose can only fall back to the
    // session before if that session was asked for.
    marketDataClient
      .getCloses(symbols, subDays(tradeDate, CLOSE_LOOKBACK_DAYS), tradeDate)
      .then(({ closes }) => {
        if (cancelled) return
        const bySymbol = new Map<string, number | null>()
        for (const symbol of symbols) {
          bySymbol.set(symbol, findClose(closes, symbol, tradeDate))
        }
        setPriced({ key: closesKey, closes: bySymbol })
      })
      .catch(() => {
        // Ranking is advice, not a gate: without closes the provider's own
        // order stands and the list stays usable.
        if (!cancelled) setPriced({ key: closesKey, closes: NO_CLOSES })
      })

    return () => {
      cancelled = true
    }
  }, [needsCloses, symbolsKey, closesKey, tradeDate])

  const closesReady = closesKey !== '' && priced.key === closesKey

  const candidates = useMemo(() => {
    if (!hasReference || referencePrice === undefined) {
      return unranked(search.results)
    }
    return rankCandidatesByTradePrice(search.results, closesReady ? priced.closes : NO_CLOSES, referencePrice)
  }, [search.results, hasReference, referencePrice, closesReady, priced.closes])

  const retry = useCallback(() => setAttempt(current => current + 1), [])

  const isSearching = enabled && isSearchable && (search.key !== searchKey || query !== debouncedQuery)

  return {
    query,
    setQuery,
    candidates,
    // Closes that came back empty - an outage, or a day the provider knows
    // nothing about - leave the list in the provider's order, and saying it is
    // ranked would dress that up as evidence.
    isRanked: closesReady && candidates.some(candidate => candidate.close !== null),
    isLoading: isSearching || (needsCloses && !closesReady),
    error: search.error,
    retry,
  }
}
