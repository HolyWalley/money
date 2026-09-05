import { useMemo } from 'react'
import { useDecoratedTransactions } from './useDecoratedTransactions'
import { summarizeCashflow } from '@/lib/cashflow'
import { buildPeriodSeries, bucketByPeriod } from '@/lib/period-series'
import { canNavigate, type Period, type PeriodSettings } from '@/lib/period-utils'
import { getPeriodDates, type TransactionFilters } from './useLiveTransactions'

/** Enough periods to see a direction without crowding a phone screen. */
export const TREND_PERIOD_COUNT = 6

const IDLE: TransactionFilters = { isLoading: true }

export interface TrendPoint {
  period: Period
  income: number
  expense: number
}

export interface PeriodTrend {
  points: TrendPoint[]
  /** False for the rolling period types, which have no series to walk back through. */
  available: boolean
  isLoading: boolean
}

export function usePeriodTrend(
  filters: TransactionFilters,
  count: number = TREND_PERIOD_COUNT
): PeriodTrend {
  const periods = useMemo(() => {
    const period = filters.period
    if (!period) return []

    const settings: PeriodSettings = {
      type: period.type,
      monthDay: period.monthDay,
      weekDay: period.weekDay,
      yearDay: period.yearDay,
    }
    if (!canNavigate(settings)) return []

    const { start, end } = getPeriodDates(period)
    return buildPeriodSeries({ start, end }, settings, count)
  }, [filters.period, count])

  // One query across the whole span rather than one per period: the rates then
  // come back in a single fetch too, instead of six overlapping ones.
  const spanFilters = useMemo(() => {
    if (periods.length === 0) return null

    return {
      ...filters,
      period: {
        type: 'custom' as const,
        customFrom: periods[0].start,
        customTo: periods[periods.length - 1].end,
      },
    }
  }, [filters, periods])

  const { transactions, isLoading } = useDecoratedTransactions(spanFilters ?? IDLE)

  const points = useMemo(() => {
    if (periods.length === 0) return []

    const buckets = bucketByPeriod(transactions, periods, transaction => new Date(transaction.date))

    return periods.map((period, index) => {
      const { income, expense } = summarizeCashflow(buckets[index])
      return { period, income, expense }
    })
  }, [periods, transactions])

  return {
    points,
    available: periods.length > 1,
    isLoading: periods.length > 0 && isLoading,
  }
}
