import { format } from 'date-fns'
import { getAdjacentPeriod, type Period, type PeriodSettings, type PeriodType } from './period-utils'

/**
 * The `count` periods ending at `anchor`, oldest first.
 *
 * Stops early rather than repeating itself: the rolling period types hand back
 * the same window however far you step, and a series of identical windows is
 * not a trend, it is the same bar drawn six times.
 */
export function buildPeriodSeries(
  anchor: Period,
  settings: PeriodSettings,
  count: number
): Period[] {
  if (count <= 0) {
    return []
  }

  const periods: Period[] = [anchor]
  let cursor = anchor

  for (let i = 1; i < count; i++) {
    const previous = getAdjacentPeriod(cursor, -1, settings)
    if (previous.start.getTime() >= cursor.start.getTime()) {
      break
    }
    periods.unshift(previous)
    cursor = previous
  }

  return periods
}

export function bucketByPeriod<T>(
  items: T[],
  periods: Period[],
  getDate: (item: T) => Date
): T[][] {
  const buckets: T[][] = periods.map(() => [])

  for (const item of items) {
    const time = getDate(item).getTime()

    for (let i = 0; i < periods.length; i++) {
      if (time >= periods[i].start.getTime() && time <= periods[i].end.getTime()) {
        buckets[i].push(item)
        break
      }
    }
  }

  return buckets
}

/**
 * How one period in a series is named on an axis: short enough to sit under a
 * bar, and specific enough to tell that bar from the one beside it.
 */
export function periodTickLabel(start: Date, periodType: PeriodType): string {
  switch (periodType) {
    case 'yearly':
      return format(start, 'yyyy')
    case 'weekly':
      return format(start, 'MMM d')
    default:
      return format(start, 'MMM')
  }
}
