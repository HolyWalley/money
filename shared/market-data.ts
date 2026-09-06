/**
 * One trading session's closing price for one instrument.
 *
 * `date` is the exchange's own calendar date for that session, not ours: a
 * close is a fact about a session, and the two disagree for exchanges whose
 * open falls on the other side of midnight UTC.
 *
 * `currency` is a plain string, never CurrencyEnum - an instrument may be
 * quoted in any currency, not only the three a user can keep wallets in.
 */
export interface DailyClose {
  date: string
  close: number
  currency: string
}

export interface InstrumentCandidate {
  symbol: string
  name: string
  currency: string
  exchange: string
}

/** One symbol's closes as the price API hands them over, keyed by day. */
export interface SymbolPrices {
  currency: string
  closes: Record<string, number>
}

export type PricesResponse = Record<string, SymbolPrices>

export interface MarketDataProvider {
  getDailyCloses(symbol: string, start: Date, end: Date): Promise<DailyClose[]>
  search(query: string): Promise<InstrumentCandidate[]>
}

/**
 * How many calendar days back a valuation will look for a close.
 *
 * Same reasoning as RATE_LOOKBACK_DAYS in src/lib/currency-conversion.ts, and
 * deliberately the same number: markets are shut at weekends and on holidays,
 * so valuing a holding on an arbitrary calendar day means using the most
 * recent prior close. A position priced from last Friday is right to within a
 * few days of drift; a position dropped for want of Sunday's close silently
 * understates the portfolio.
 */
export const CLOSE_LOOKBACK_DAYS = 7

/**
 * What one price request may ask for.
 *
 * Both caps bound the worker's fan-out: an invocation only gets so many
 * subrequests, and one request turns into MAX_FETCHES_PER_SYMBOL provider calls
 * per symbol. They live here rather than in the handler because the client has
 * to split a longer history into requests the server will actually accept - a
 * four-year chart asked for in one go would simply be refused.
 *
 * The day cap is measured over the window the server actually fetches, which
 * starts CLOSE_LOOKBACK_DAYS before the requested `from`; FETCH_WINDOW_DAYS is
 * the widest inclusive range a caller may therefore ask for.
 */
export const MAX_SYMBOLS_PER_REQUEST = 12

export const MAX_RANGE_DAYS = 400 + CLOSE_LOOKBACK_DAYS

export const FETCH_WINDOW_DAYS = MAX_RANGE_DAYS - CLOSE_LOOKBACK_DAYS

/**
 * The [from, to] windows one range has to be asked for in, oldest first.
 *
 * A single window where the range fits, which is every ordinary render; only a
 * chart reaching years back is split.
 */
export function fetchWindows(from: string, to: string, windowDays = FETCH_WINDOW_DAYS): DateRange[] {
  const windows: DateRange[] = []
  let start = from

  while (start <= to) {
    const end = shiftDateKey(start, windowDays - 1)
    windows.push({ from: start, to: end < to ? end : to })
    if (end >= to) break
    start = shiftDateKey(end, 1)
  }

  return windows
}

/** Mirrors ExchangeRateService.createCacheKey - one key shape per cached fact. */
export function createPriceCacheKey(symbol: string, date: string): string {
  return `${symbol}:${date}`
}

export function utcDateKey(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const cursor = new Date(Date.UTC(year, month - 1, day))
  cursor.setUTCDate(cursor.getUTCDate() + days)
  return utcDateKey(cursor)
}

/**
 * The close to value `symbol` at on `onDate`, forward-filled from the most
 * recent prior session. Null rather than zero when nothing is in reach: a
 * holding priced at zero reads as a loss, a holding reported as unpriced reads
 * as incomplete.
 */
export function findClose(
  closes: Map<string, number>,
  symbol: string,
  onDate: Date,
  lookbackDays: number = CLOSE_LOOKBACK_DAYS
): number | null {
  const cursor = new Date(onDate.getTime())

  for (let i = 0; i <= lookbackDays; i++) {
    const close = closes.get(createPriceCacheKey(symbol, utcDateKey(cursor)))
    if (close !== undefined && close > 0) {
      return close
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  return null
}

/**
 * How far back the refreshable tip reaches.
 *
 * Today's number is not a close at all until the session ends, and yesterday's
 * only became final late in yesterday's UTC day - if nobody asked between the
 * closing bell and midnight, what we stored is an intraday price. Re-asking for
 * one extra day costs the same single provider call and settles the common
 * case, where somebody does open the app the next day.
 *
 * It settles nothing on its own, though: a user who opens the app once a week
 * never asks while last Monday is inside the tip, so what a bar IS is recorded
 * when it is stored - see isSettledBar - and an unsettled one is refetched
 * however old it has grown.
 */
export const REFRESHABLE_TIP_DAYS = 1

/** The oldest day whose stored close may still be replaced on age alone. */
export function refreshableFrom(today: string): string {
  return shiftDateKey(today, -REFRESHABLE_TIP_DAYS)
}

/** A range of calendar days, both ends included. */
export interface DateRange {
  from: string
  to: string
}

export type FetchRange = DateRange

/**
 * Whether a bar the provider just handed us is a finished session's close.
 *
 * Age at READ time cannot answer this, and inferring it is what froze a bad
 * number: a request landing at 18:00 UTC on a Monday, before the US close, gets
 * Monday's intraday quote, and once Monday drops out of the refreshable tip
 * that quote is treated as final for ever. Two facts about the ANSWER settle it
 * instead - a later session in the same response proves this one ended, and a
 * bar dated before the UTC day we asked on cannot still be trading, because
 * every exchange's session for its own local date D is over by D+1 00:00 UTC.
 */
export function isSettledBar(date: string, latestInResponse: string, fetchedOn: string): boolean {
  return date < latestInResponse || date < fetchedOn
}

/**
 * The same days, as few ranges as possible: sorted, non-overlapping, and with
 * touching ranges joined - examining [Jan..Feb] and then [Mar..Apr] leaves no
 * unexamined day between them.
 */
export function mergeRanges(ranges: readonly DateRange[]): DateRange[] {
  const sorted = [...ranges]
    .filter((range) => range.from <= range.to)
    .sort((a, b) => (a.from === b.from ? 0 : a.from < b.from ? -1 : 1))

  const merged: DateRange[] = []

  for (const range of sorted) {
    const last = merged[merged.length - 1]
    if (last && range.from <= shiftDateKey(last.to, 1)) {
      if (range.to > last.to) {
        last.to = range.to
      }
      continue
    }
    merged.push({ from: range.from, to: range.to })
  }

  return merged
}

/**
 * What genuinely has to be fetched to answer a request for [from, to].
 *
 * A stored close for a settled day is immutable, so it is never refetched.
 * Only the tip is - see REFRESHABLE_TIP_DAYS - plus anything the provider gave
 * us mid-session, which `unsettledFrom` points at. That one rule is what keeps
 * this cheap, and what makes a provider outage merely freeze the tip of the
 * graph instead of losing history.
 *
 * `examined` is the LIST of ranges already asked about, never their min/max
 * span, and holes inside one examined range are not gaps: most days inside it
 * have no close at all and never will (weekends, market holidays), so hunting
 * gaps day by day would refetch the same empty days on every single request.
 * But two DISJOINT examined ranges say nothing about the window between them.
 * Collapsing them into one span is what let viewing March, then January, mark
 * February covered without anyone ever fetching it - in a store shared by every
 * user, which then never asks again.
 */
export function planPriceFetch(
  examined: readonly DateRange[] | null,
  from: string,
  to: string,
  today: string,
  unsettledFrom?: string | null
): FetchRange[] {
  // No session has closed in the future, so never ask for one.
  const end = to > today ? today : to
  if (from > end) {
    return []
  }

  const wanted: FetchRange[] = []
  let cursor = from

  for (const range of mergeRanges(examined ?? [])) {
    if (range.to < cursor) {
      continue
    }
    if (range.from > end) {
      break
    }
    if (range.from > cursor) {
      wanted.push({ from: cursor, to: shiftDateKey(range.from, -1) })
    }
    cursor = shiftDateKey(range.to, 1)
    if (cursor > end) {
      break
    }
  }

  if (cursor <= end) {
    wanted.push({ from: cursor, to: end })
  }

  // Whatever is stored, a request that runs to today re-asks for the tip.
  if (end === today) {
    const tipStart = refreshableFrom(today)
    wanted.push({ from: tipStart > from ? tipStart : from, to: end })
  }

  // Reaching to `end` rather than to the unsettled day alone is deliberate: a
  // later session in the same answer is what proves this one has ended.
  if (unsettledFrom && unsettledFrom >= from && unsettledFrom <= end) {
    wanted.push({ from: unsettledFrom, to: end })
  }

  return mergeRanges(wanted)
}

/**
 * How close a candidate's close has to sit to the executed price to be treated
 * as the same listing. 1.5% was enough to pick the right listing for all 13
 * real trades this was checked against, while still separating listings that
 * differ by an FX factor.
 */
export const TRADE_PRICE_MATCH_TOLERANCE = 0.015

export interface RankedCandidate extends InstrumentCandidate {
  close: number | null
  deviation: number | null
  matches: boolean
}

/**
 * Ranks search hits by how well the symbol's close on the trade date agrees
 * with the price actually paid.
 *
 * Searching by ISIN returns SOME listing of the security, not necessarily the
 * one the user holds - the same ISIN answered with a London USD line where the
 * holding was the Xetra EUR one, and the two differ by the FX rate. The price
 * the user actually paid is the only evidence in the statement that tells the
 * two apart, so it decides the order. It still only orders them: the caller
 * confirms, because a wrong symbol misprices a holding forever after.
 */
export function rankCandidatesByTradePrice(
  candidates: InstrumentCandidate[],
  closeBySymbol: ReadonlyMap<string, number | null>,
  executedPrice: number
): RankedCandidate[] {
  const ranked = candidates.map((candidate) => {
    const close = closeBySymbol.get(candidate.symbol) ?? null
    const deviation =
      close !== null && close > 0 && executedPrice > 0
        ? Math.abs(close - executedPrice) / executedPrice
        : null

    return {
      ...candidate,
      close,
      deviation,
      matches: deviation !== null && deviation <= TRADE_PRICE_MATCH_TOLERANCE,
    }
  })

  // Unpriced candidates keep their provider order at the back rather than
  // being dropped: the provider's own ranking is the only signal left for them.
  return ranked.sort((a, b) => {
    if (a.deviation === null && b.deviation === null) return 0
    if (a.deviation === null) return 1
    if (b.deviation === null) return -1
    return a.deviation - b.deviation
  })
}
