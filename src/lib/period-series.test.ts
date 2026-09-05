import { describe, it, expect } from 'vitest'
import { UTCDate } from '@date-fns/utc'
import { buildPeriodSeries, bucketByPeriod, periodTickLabel } from './period-series'
import { getPeriodContainingDate, type PeriodSettings } from './period-utils'

function date(str: string): UTCDate {
  const [year, month, day] = str.split('-').map(Number)
  return new UTCDate(year, month - 1, day, 12, 0, 0)
}

function formatDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const monthly: PeriodSettings = { type: 'monthly', monthDay: 1 }

describe('buildPeriodSeries', () => {
  it('ends at the anchor and runs oldest first', () => {
    const anchor = getPeriodContainingDate(date('2026-09-15'), monthly)
    const series = buildPeriodSeries(anchor, monthly, 3)

    expect(series.map(p => formatDate(p.start))).toEqual(['2026-07-01', '2026-08-01', '2026-09-01'])
  })

  it('is just the anchor when only one period is asked for', () => {
    const anchor = getPeriodContainingDate(date('2026-09-15'), monthly)

    expect(buildPeriodSeries(anchor, monthly, 1)).toEqual([anchor])
  })

  it('is empty when no periods are asked for', () => {
    const anchor = getPeriodContainingDate(date('2026-09-15'), monthly)

    expect(buildPeriodSeries(anchor, monthly, 0)).toEqual([])
  })

  it('walks back across a year boundary', () => {
    const anchor = getPeriodContainingDate(date('2026-01-15'), monthly)
    const series = buildPeriodSeries(anchor, monthly, 3)

    expect(series.map(p => formatDate(p.start))).toEqual(['2025-11-01', '2025-12-01', '2026-01-01'])
  })

  it('follows a period that starts on a day other than the first', () => {
    const settings: PeriodSettings = { type: 'monthly', monthDay: 15 }
    const anchor = getPeriodContainingDate(date('2026-09-20'), settings)
    const series = buildPeriodSeries(anchor, settings, 2)

    expect(series.map(p => formatDate(p.start))).toEqual(['2026-08-15', '2026-09-15'])
  })

  it('steps by week for a weekly period', () => {
    const settings: PeriodSettings = { type: 'weekly', weekDay: 1 }
    const anchor = getPeriodContainingDate(date('2026-09-16'), settings)
    const series = buildPeriodSeries(anchor, settings, 3)

    const starts = series.map(p => formatDate(p.start))
    expect(starts).toHaveLength(3)
    expect(starts[2]).toBe(formatDate(anchor.start))
  })

  // A rolling window hands back the same period however far you step, and six
  // copies of one window is not a trend.
  it('gives up rather than repeating a period that cannot be stepped back', () => {
    const settings: PeriodSettings = { type: 'last30days' }
    const anchor = getPeriodContainingDate(date('2026-09-15'), settings)

    expect(buildPeriodSeries(anchor, settings, 6)).toEqual([anchor])
  })
})

describe('bucketByPeriod', () => {
  const periods = buildPeriodSeries(getPeriodContainingDate(date('2026-09-15'), monthly), monthly, 3)
  const at = (str: string) => ({ when: new Date(`${str}T12:00:00`) })

  it('drops each item into the period that contains it', () => {
    const buckets = bucketByPeriod(
      [at('2026-07-04'), at('2026-08-20'), at('2026-09-01'), at('2026-09-30')],
      periods,
      item => item.when
    )

    expect(buckets.map(b => b.length)).toEqual([1, 1, 2])
  })

  it('returns one empty bucket per period when there is nothing to place', () => {
    expect(bucketByPeriod([], periods, (item: { when: Date }) => item.when)).toEqual([[], [], []])
  })

  it('leaves out anything falling outside every period', () => {
    const buckets = bucketByPeriod([at('2026-01-15'), at('2026-12-15')], periods, item => item.when)

    expect(buckets.map(b => b.length)).toEqual([0, 0, 0])
  })

  it('places an item landing on a period boundary', () => {
    const buckets = bucketByPeriod([at('2026-08-01')], periods, item => item.when)

    expect(buckets.map(b => b.length)).toEqual([0, 1, 0])
  })
})

describe('periodTickLabel', () => {
  it('names a month for a monthly period', () => {
    expect(periodTickLabel(new Date(2026, 8, 1), 'monthly')).toBe('Sep')
  })

  // Twelve ticks reading "Sep" would not tell one week from another.
  it('names the day a weekly period starts on', () => {
    expect(periodTickLabel(new Date(2026, 8, 14), 'weekly')).toBe('Sep 14')
  })

  it('names the year for a yearly period', () => {
    expect(periodTickLabel(new Date(2026, 0, 1), 'yearly')).toBe('2026')
  })

  it('falls back to a month name for a rolling period', () => {
    expect(periodTickLabel(new Date(2026, 8, 1), 'last30days')).toBe('Sep')
  })
})
