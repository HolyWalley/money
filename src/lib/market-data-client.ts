import type { DateRange, InstrumentCandidate, PricesResponse } from '../../shared/market-data'
import {
  CLOSE_LOOKBACK_DAYS,
  createPriceCacheKey,
  mergeRanges,
  planPriceFetch,
  refreshableFrom,
  shiftDateKey,
  utcDateKey,
} from '../../shared/market-data'
import type { InstrumentPriceRecord } from './db-dexie'
import { db } from './db-dexie'
import { apiClient, isRetryableFailure } from './api-client'
import { getConnectionState } from './network-status'

export type { PricesResponse, SymbolPrices } from '../../shared/market-data'

export interface CachedCloses {
  /** Keyed `${symbol}:${date}`, ready for findClose(). */
  closes: Map<string, number>
  /**
   * The currency each symbol's closes are quoted in, as the market quotes it -
   * which is not always the instrument's nominal currency (an LSE line comes
   * back in GBp, pence).
   */
  currencies: Map<string, string>
}

/**
 * What came back, and whether asking again could change it.
 *
 * A bare `null` conflated two opposite situations: an offline blip, which the
 * next render should retry, and a request the server will refuse however often
 * it is sent - a range wider than the day cap, say. Retrying the second every
 * 30 seconds forever is what collapsing them cost.
 */
export type PriceFetchOutcome =
  | { ok: true, prices: PricesResponse }
  | { ok: false, retryable: boolean }

export type PriceFetcher = (symbols: string[], from: string, to: string) => Promise<PriceFetchOutcome>

/**
 * How long the tip of the graph is trusted before we ask the server again.
 *
 * Past sessions are final and never expire, so this only governs today's
 * number. Without it every render that spans today would hit the network,
 * because today is always a legitimate gap - and on a weekend it stays one
 * however often we ask.
 */
export const TIP_TTL_MS = 60 * 60 * 1000

/**
 * How long a failed request holds off the next one.
 *
 * Deliberately far shorter than TIP_TTL_MS: a failure is evidence about the
 * link, not about the data, so it must not cost an hour of stale prices the way
 * a real answer legitimately does. It is not zero only because a render loop
 * behind a dead link would otherwise fire a request per render.
 */
export const RETRY_AFTER_FAILURE_MS = 30 * 1000

async function fetchPricesFromApi(symbols: string[], from: string, to: string): Promise<PriceFetchOutcome> {
  const response = await apiClient.getPrices(symbols, from, to)
  if (response.ok && response.data) {
    return { ok: true, prices: response.data }
  }
  return { ok: false, retryable: isRetryableFailure(response.failure) }
}

/**
 * A fetch stamp no two answers can share.
 *
 * Records carry the stamp of the answer that wrote them, and examinedRanges
 * recovers what a request covered by grouping on it - so two requests stamped
 * alike have their ranges merged into one span. Two disjoint fetches for one
 * symbol started in the same tick, a chart showing January beside a table
 * showing March, would then claim February was examined, and that claim is
 * written to IndexedDB rather than merely held in memory.
 */
let lastFetchStamp = 0

function nextFetchStamp(): number {
  const now = Date.now()
  lastFetchStamp = now > lastFetchStamp ? now : lastFetchStamp + 1
  return lastFetchStamp
}

/**
 * Searches the shared symbol index. Results are candidates for a human to
 * confirm, never an answer: see rankCandidatesByTradePrice.
 */
export async function searchSymbols(query: string): Promise<InstrumentCandidate[]> {
  const response = await apiClient.searchInstruments(query)
  // A search that never reached the index is not an index with nothing in it.
  // Reported as no candidates, it sends the user off to hand-type a symbol
  // that was there all along - the same mistake the 401 refresh above exists
  // to prevent, and the caller has an error state for exactly this.
  if (!response.ok) {
    throw new Error(response.error ?? 'The symbol search could not be reached')
  }
  return response.data?.results ?? []
}

interface Attempt {
  from: string
  to: string
  at: number
}

export class MarketDataClient {
  private fetcher: PriceFetcher
  private attempts = new Map<string, Attempt>()
  private failures = new Map<string, number>()
  private linkWasDown = false

  constructor(fetcher: PriceFetcher = fetchPricesFromApi) {
    this.fetcher = fetcher
  }

  /**
   * Closes for the given symbols across [from, to], served from the local
   * cache and topped up from the server only where something is genuinely
   * missing.
   *
   * The answer reaches CLOSE_LOOKBACK_DAYS before `from`, because a period
   * starting on a Saturday has no close of its own and findClose has to walk
   * back to Friday's. Dropping those days is what left the first days of every
   * such period unpriced.
   */
  async getCloses(symbols: string[], from: Date, to: Date): Promise<CachedCloses> {
    const unique = [...new Set(symbols)]
    if (unique.length === 0) {
      return { closes: new Map(), currencies: new Map() }
    }

    const fromKey = utcDateKey(from)
    const toKey = utcDateKey(to)
    const seedKey = shiftDateKey(fromKey, -CLOSE_LOOKBACK_DAYS)
    const today = utcDateKey(new Date())
    const now = Date.now()

    const cached = await db.instrumentPrices.where('symbol').anyOf(unique).toArray()
    const stale = this.linkIsUp()
      ? unique.filter((symbol) =>
          this.needsFetch(symbol, cached.filter((record) => record.symbol === symbol), fromKey, toKey, today, now)
        )
      : []

    if (stale.length > 0) {
      const outcome = await this.fetcher(stale, fromKey, toKey)
      if (outcome.ok) {
        for (const symbol of stale) {
          this.attempts.set(symbol, { from: fromKey, to: toKey, at: now })
          this.failures.delete(symbol)
        }
        const records = toRecords(outcome.prices, nextFetchStamp())
        if (records.length > 0) {
          await db.instrumentPrices.bulkPut(records)
          cached.push(...records)
        }
      } else if (outcome.retryable) {
        // Not an attempt: nothing was answered, so there is nothing to know for
        // an hour. Only the short retry pause below applies.
        for (const symbol of stale) {
          this.failures.set(symbol, now)
        }
      } else {
        // The server understood and refused - a range past the day cap, say.
        // Sending it again unchanged gets the same answer, so this counts as
        // having asked: the hour-long, range-scoped brake applies, and a
        // narrower request is still free to go out immediately.
        for (const symbol of stale) {
          this.attempts.set(symbol, { from: fromKey, to: toKey, at: now })
        }
      }
    }

    const closes = new Map<string, number>()
    const currencies = new Map<string, string>()

    for (const record of cached) {
      if (record.date < seedKey || record.date > toKey) {
        continue
      }
      closes.set(record.key, record.close)
      if (record.currency) {
        currencies.set(record.symbol, record.currency)
      }
    }

    return { closes, currencies }
  }

  /**
   * Whether it is worth asking at all - and the one place an outage is
   * forgiven.
   *
   * A PWA renders while the link is down as a matter of course, so nothing is
   * attempted then, and coming back clears what the outage left behind rather
   * than making the user wait out a pause the network already ended.
   *
   * Only 'offline' stops a request, matching sync.ts: 'unreachable' is a guess
   * made from two failed calls, and attempting is the only thing that can
   * disprove it. Skipping it here self-locked, because prices went through the
   * same api-client that counts those failures - two flaky price calls marked
   * the link unreachable, and no later call could clear it. RETRY_AFTER_FAILURE_MS
   * is what keeps a dead link from being asked on every render.
   */
  private linkIsUp(): boolean {
    const state = getConnectionState()

    // Recovery is a transition back to 'online', not the act of being allowed
    // to ask: a pause the network has already ended should not still be served.
    if (state === 'online' && this.linkWasDown) {
      this.failures.clear()
    }
    this.linkWasDown = state !== 'online'

    return state !== 'offline'
  }

  private needsFetch(
    symbol: string,
    records: InstrumentPriceRecord[],
    from: string,
    to: string,
    today: string,
    now: number
  ): boolean {
    const plan = planPriceFetch(examinedRanges(records), from, to, today)
    if (plan.length === 0) {
      return false
    }

    const failedAt = this.failures.get(symbol)
    if (failedAt !== undefined && failedAt > now - RETRY_AFTER_FAILURE_MS) {
      return false
    }

    // We already asked the server for this range, or a wider one, moments ago.
    // Asking again cannot produce anything new - not even for a symbol the
    // server could not price at all, which would otherwise refetch forever.
    const attempt = this.attempts.get(symbol)
    if (attempt && attempt.at > now - TIP_TTL_MS && attempt.from <= from && attempt.to >= to) {
      return false
    }

    // A plan that asks for nothing but the refreshable tip is answered by a
    // recent fetch; one that reaches further back is a real backfill and always
    // goes out.
    const tipStart = refreshableFrom(today)
    const tipOnly = plan.every((range) => range.from >= tipStart)
    if (tipOnly) {
      // Only rows that cover the tip say anything about how fresh the tip is.
      // Measured across every row of the symbol instead, a fetch of some far
      // older window marks today as freshly known - which is exactly what the
      // symbol picker does when it prices candidates on a trade date years ago.
      // The holding it just resolved then sits unpriced for an hour, with the
      // stamp in IndexedDB so a reload does not clear it either.
      const tipFetchedAt = records.reduce(
        (latest, record) => (record.date >= tipStart ? Math.max(latest, record.fetchedAt) : latest),
        0
      )
      if (tipFetchedAt > now - TIP_TTL_MS) {
        return false
      }
    }

    return true
  }
}

/**
 * The ranges this cache has already asked the server about.
 *
 * Every record written by one answer carries that answer's fetchedAt, so the
 * days each request covered come back by grouping on it - and they must stay
 * separate ranges. Two disjoint fetches, March and then January, have a min/max
 * span that claims February was examined when nobody ever asked for it, and
 * that claim would never expire: February would read as covered, and empty,
 * for as long as the cache lives.
 *
 * The grouping is only sound because nextFetchStamp never repeats a value; a
 * plain Date.now() lets two answers in one tick share a key and merge exactly
 * the way this exists to prevent.
 */
function examinedRanges(records: InstrumentPriceRecord[]): DateRange[] {
  const byFetch = new Map<number, DateRange>()

  for (const record of records) {
    const range = byFetch.get(record.fetchedAt)
    if (!range) {
      byFetch.set(record.fetchedAt, { from: record.date, to: record.date })
      continue
    }
    if (record.date < range.from) range.from = record.date
    if (record.date > range.to) range.to = record.date
  }

  return mergeRanges([...byFetch.values()])
}

function toRecords(response: PricesResponse, fetchedAt: number): InstrumentPriceRecord[] {
  const records: InstrumentPriceRecord[] = []

  for (const [symbol, prices] of Object.entries(response)) {
    for (const [date, close] of Object.entries(prices.closes)) {
      records.push({
        key: createPriceCacheKey(symbol, date),
        symbol,
        date,
        close,
        currency: prices.currency,
        fetchedAt,
      })
    }
  }

  return records
}

export const marketDataClient = new MarketDataClient()
