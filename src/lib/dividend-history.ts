import type { DailyConverter } from './portfolio-history'
import type { PositionTrade } from './positions'

/**
 * What each holding paid out, month by month, in the base currency.
 *
 * Every payment is converted at the rate of the day it was received rather than
 * today's: a dividend is cash that arrived once, and restating last year's at
 * this year's rate would have the past change every time the currency market
 * moves.
 */

export interface MonthlyDividend {
  year: number
  /** 0-11, as the Date API counts months. */
  month: number
  amount: number
}

export interface DividendHistory {
  /** Only the months something was actually paid in, oldest first. */
  months: MonthlyDividend[]
  /** Currencies no rate reaches, whose payments are therefore not in the totals. */
  missingCurrencies: string[]
}

export function summariseDividends(
  trades: PositionTrade[],
  convertOn: DailyConverter
): DividendHistory {
  const buckets = new Map<string, MonthlyDividend>()
  const missing = new Set<string>()

  for (const trade of trades) {
    if (trade.kind !== 'dividend') continue

    const time = Date.parse(trade.date)
    // A row nobody can place in time cannot be put in a month either.
    if (Number.isNaN(time)) continue

    const date = new Date(time)
    const amount = convertOn(trade.amount, trade.currency, date)
    if (amount === null) {
      missing.add(trade.currency)
      continue
    }

    const year = date.getUTCFullYear()
    const month = date.getUTCMonth()
    const key = `${year}-${month}`

    const bucket = buckets.get(key)
    if (bucket) bucket.amount += amount
    else buckets.set(key, { year, month, amount })
  }

  const months = [...buckets.values()].sort(
    (a, b) => a.year - b.year || a.month - b.month
  )

  return { months, missingCurrencies: [...missing].sort() }
}

/** Every year with a payment in it, newest first - the order the tabs read in. */
export function dividendYears(months: MonthlyDividend[]): number[] {
  return [...new Set(months.map(month => month.year))].sort((a, b) => b - a)
}

export function totalDividends(months: MonthlyDividend[]): number {
  return months.reduce((total, month) => total + month.amount, 0)
}

/**
 * The last twelve months, ending with the current one.
 *
 * A rolling year rather than a calendar one: in March, "this year" is three
 * months of income and reads as a collapse next to last year's twelve.
 */
export function trailingTwelveMonths(
  months: MonthlyDividend[],
  asOf: Date
): MonthlyDividend[] {
  const cutoff = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 11, 1))
  const cutoffKey = cutoff.getUTCFullYear() * 12 + cutoff.getUTCMonth()

  return months.filter(month => month.year * 12 + month.month >= cutoffKey)
}

export function dividendsIn(months: MonthlyDividend[], year: number): MonthlyDividend[] {
  return months.filter(month => month.year === year)
}

/** One total per year, oldest first, with the empty years in between kept. */
export function yearlyTotals(months: MonthlyDividend[]): Array<{ year: number; amount: number }> {
  if (months.length === 0) return []

  const totals = new Map<number, number>()
  for (const month of months) {
    totals.set(month.year, (totals.get(month.year) ?? 0) + month.amount)
  }

  const years = [...totals.keys()]
  const first = Math.min(...years)
  const last = Math.max(...years)

  // A year nothing was paid in is a real answer - the chart would otherwise put
  // 2023 next to 2025 and read as two consecutive years.
  const series: Array<{ year: number; amount: number }> = []
  for (let year = first; year <= last; year++) {
    series.push({ year, amount: totals.get(year) ?? 0 })
  }

  return series
}
