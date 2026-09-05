import type { DailyClose, InstrumentCandidate, MarketDataProvider } from './market-data'
import { utcDateKey } from './market-data'

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string
        symbol?: string
        regularMarketPrice?: number
        fullExchangeName?: string
        gmtoffset?: number
      }
      timestamp?: number[]
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>
        }>
      }
    }> | null
    error?: { code?: string; description?: string } | null
  }
}

interface YahooSearchResponse {
  quotes?: Array<{
    symbol?: string
    shortname?: string
    longname?: string
    exchange?: string
    exchDisp?: string
    currency?: string
    quoteType?: string
  }>
}

const SECONDS_PER_DAY = 86400

// Yahoo answers an unadorned client with a consent redirect or an empty body.
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

/**
 * Daily closes and symbol search from Yahoo Finance's chart endpoints.
 *
 * THESE ENDPOINTS ARE UNDOCUMENTED AND CARRY NO SLA. They need no key, and
 * they are the only free source that covers European listings, but they may
 * change shape or start refusing us without notice. Every field is therefore
 * read defensively, and the caller is expected to treat a failure as "the tip
 * of the graph is frozen", never as "this instrument has no price".
 *
 * Two more things this provider cannot decide for the caller:
 *
 * 1. SEARCH RESOLVES TO SOME LISTING, NOT THE USER'S. An ISIN search answered
 *    with a London USD line for a security actually held on Xetra in EUR; the
 *    two quotes differ by the FX rate, so picking automatically would misprice
 *    the holding forever. Resolution must stay in front of a human - see
 *    rankCandidatesByTradePrice in ./market-data.
 * 2. LSE lines are quoted in 'GBp' (pence, one hundredth of GBP) and are
 *    returned here verbatim, currency and all. Nothing is scaled: a silent
 *    divide-by-100 on a currency string we merely guessed at would be a worse
 *    failure than an obviously mismatched price.
 */
export class YahooMarketDataProvider implements MarketDataProvider {
  private baseUrl: string
  private timeoutMs: number

  constructor(baseUrl: string = 'https://query1.finance.yahoo.com', timeoutMs: number = 8000) {
    this.baseUrl = baseUrl
    this.timeoutMs = timeoutMs
  }

  async getDailyCloses(symbol: string, start: Date, end: Date): Promise<DailyClose[]> {
    const period1 = Math.floor(this.utcMidnight(start) / 1000)
    // period2 is exclusive, so the requested last day only comes back if we ask
    // for the midnight after it.
    const period2 = Math.floor(this.utcMidnight(end) / 1000) + SECONDS_PER_DAY

    const url = `${this.baseUrl}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`
    const data = await this.request<YahooChartResponse>(url)

    const description = data.chart?.error?.description
    if (description) {
      throw new Error(`Failed to fetch market data for ${symbol}: ${description}`)
    }

    const result = data.chart?.result?.[0]
    if (!result) {
      throw new Error(`No market data returned for ${symbol}`)
    }

    const currency = result.meta?.currency
    if (!currency) {
      // A number without its currency cannot be stored: it would be summed into
      // a portfolio total as if it were already in the user's currency.
      throw new Error(`No currency in market data for ${symbol}`)
    }

    const timestamps = result.timestamp ?? []
    const closes = result.indicators?.quote?.[0]?.close ?? []
    // The chart endpoint stamps each daily bar with the instant the session
    // opened in exchange local time, so the calendar day has to be read in that
    // exchange's offset. In UTC an ASX bar lands on the previous day.
    const gmtOffset = result.meta?.gmtoffset ?? 0

    const dailyCloses: DailyClose[] = []
    const length = Math.min(timestamps.length, closes.length)

    for (let i = 0; i < length; i++) {
      const close = closes[i]
      // A null is a day the instrument did not trade, not a price of zero.
      if (close === null || close === undefined || !Number.isFinite(close)) {
        continue
      }

      dailyCloses.push({
        date: utcDateKey(new Date((timestamps[i] + gmtOffset) * 1000)),
        close,
        currency,
      })
    }

    return dailyCloses
  }

  async search(query: string): Promise<InstrumentCandidate[]> {
    const url = `${this.baseUrl}/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`
    const data = await this.request<YahooSearchResponse>(url)

    const candidates: InstrumentCandidate[] = []

    for (const quote of data.quotes ?? []) {
      if (!quote.symbol) {
        continue
      }

      candidates.push({
        symbol: quote.symbol,
        name: quote.longname || quote.shortname || quote.symbol,
        // Search hits usually omit the currency; it is only authoritative on
        // the chart response, so the empty string means "not known yet" here.
        currency: quote.currency ?? '',
        exchange: quote.exchDisp || quote.exchange || '',
      })
    }

    return candidates
  }

  private async request<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch market data: ${response.statusText}`)
    }

    return (await response.json()) as T
  }

  private utcMidnight(date: Date): number {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  }
}
