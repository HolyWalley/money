import { ExchangeRateService, mergeRates, type RatesRead } from '../../shared/exchange-rates'
import { findRate, RATE_LOOKBACK_DAYS } from './currency-conversion'
import { getExchangeRateService } from './exchange-rate-service'
import { createResource, type CacheAnswer } from './suspense-resource'

/**
 * Exchange rates as a stale-while-revalidate resource: the cache answers when
 * it can, and the provider fills the gap behind the render.
 */

export const RATES_REVALIDATE_AFTER_MS = 60 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000

export interface RatesRequest {
  baseCurrency: string
  targetCurrencies: string[]
  startDate: Date
  endDate: Date
}

const utcDay = (date: Date): string => date.toISOString().split('T')[0]
const dayStart = (day: string): Date => new Date(`${day}T00:00:00.000Z`)

/**
 * By UTC day rather than instant, so readers pinned milliseconds apart (every
 * `useCurrentRates` instance takes its own `new Date()`) share one entry.
 */
export function ratesKey({ baseCurrency, targetCurrencies, startDate, endDate }: RatesRequest): string {
  const targets = [...new Set(targetCurrencies)].sort()
  return `${baseCurrency}|${targets.join(',')}|${utcDay(startDate)}|${utcDay(endDate)}`
}

export function parseRatesKey(key: string): RatesRequest {
  const [baseCurrency, targets, start, end] = key.split('|')
  return {
    baseCurrency,
    targetCurrencies: targets ? targets.split(',') : [],
    startDate: dayStart(start),
    endDate: dayStart(end),
  }
}

const currencyOf = (key: string): string => key.split(':')[1]
const dayOf = (key: string): string => key.split(':')[2]

/** The newest day each currency has a row on, which is where its tip begins. */
function lastPresentDays(present: Map<string, number>): Map<string, string> {
  const days = new Map<string, string>()
  for (const key of present.keys()) {
    const currency = currencyOf(key)
    const day = dayOf(key)
    const last = days.get(currency)
    if (last === undefined || day > last) days.set(currency, day)
  }
  return days
}

// The keys findRate tries for a conversion on `onDate`, newest first.
function lookbackKeys(baseCurrency: string, currency: string, onDate: Date): string[] {
  const keys: string[] = []
  const cursor = new Date(onDate.getTime())
  for (let i = 0; i <= RATE_LOOKBACK_DAYS; i++) {
    keys.push(ExchangeRateService.createCacheKey(baseCurrency, currency, utcDay(cursor)))
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return keys
}

// A rate within the lookback converts; a tombstone (rate 0) there marks a
// currency the provider does not publish, which waiting would not change.
function currencyAnswered(present: Map<string, number>, baseCurrency: string, currency: string, onDate: Date): boolean {
  if (findRate(present, baseCurrency, currency, onDate) !== null) return true
  return lookbackKeys(baseCurrency, currency, onDate).some(key => present.get(key) === 0)
}

/**
 * Whether the cache can stand in for the provider. A hole between two rows is a
 * day the provider published and the cache missed, and a total is wrong until
 * it is filled. The run of days after the last row is the tip - today, and the
 * weekend or the days the app was shut before it - which `findRate` converts at
 * the last row anyway and the provider forward-fills with that same rate. So on
 * a Monday morning Friday's row answers, and every value it stands in for is
 * replaced in place once the real ones land.
 */
export function ratesAnswer(read: RatesRead, request: RatesRequest): CacheAnswer<Map<string, number>> {
  const present = mergeRates(read.rates, read.expired)
  const stale = read.expired.size + read.missing.length > 0

  const yesterday = utcDay(new Date(Date.now() - DAY_MS))
  const settledEnd = utcDay(request.endDate) < yesterday ? utcDay(request.endDate) : yesterday
  const lastPresent = lastPresentDays(present)
  const hasHole = read.missing.some(
    key => dayOf(key) <= settledEnd && dayOf(key) < (lastPresent.get(currencyOf(key)) ?? '')
  )
  if (hasHole) {
    return { value: present, answers: false, stale }
  }

  const answers = request.targetCurrencies.every(currency =>
    currencyAnswered(present, request.baseCurrency, currency, request.endDate)
  )
  return { value: present, answers, stale }
}

export const ratesResource = createResource<Map<string, number>>({
  async fromCache(key) {
    const request = parseRatesKey(key)
    const read = await getExchangeRateService().readRates(
      request.baseCurrency,
      request.targetCurrencies,
      request.startDate,
      request.endDate
    )
    return ratesAnswer(read, request)
  },
  async load(key) {
    const request = parseRatesKey(key)
    const { rates, complete } = await getExchangeRateService().getRatesWithStatus(
      request.baseCurrency,
      request.targetCurrencies,
      request.startDate,
      request.endDate
    )
    return { value: rates, complete }
  },
  merge: mergeRates,
  revalidateAfterMs: RATES_REVALIDATE_AFTER_MS,
})
