import { useMemo } from 'react'
import { useDecoratedTransactions } from './useDecoratedTransactions'
import { summarizeCashflow, EMPTY_CASHFLOW, type CashflowSummary } from '@/lib/cashflow'
import { canNavigate, type PeriodSettings } from '@/lib/period-utils'
import type { TransactionFilters } from './useLiveTransactions'

const IDLE: TransactionFilters = { isLoading: true }

export interface PeriodComparison {
  summary: CashflowSummary
  /**
   * False for the rolling period types. "Last 30 days" has no period before it -
   * stepping back hands the same window straight back, which would read as a
   * comparison against itself and always show no change at all.
   */
  available: boolean
  isLoading: boolean
}

export function usePreviousPeriodCashflow(filters: TransactionFilters): PeriodComparison {
  const previousFilters = useMemo(() => {
    const period = filters.period
    if (!period) return null

    const settings: PeriodSettings = {
      type: period.type,
      monthDay: period.monthDay,
      weekDay: period.weekDay,
      yearDay: period.yearDay,
    }
    if (!canNavigate(settings)) return null

    return {
      ...filters,
      period: { ...period, currentPeriod: (period.currentPeriod ?? 0) - 1 },
    }
  }, [filters])

  const { transactions, isLoading } = useDecoratedTransactions(previousFilters ?? IDLE)

  const summary = useMemo(
    () => (previousFilters ? summarizeCashflow(transactions) : EMPTY_CASHFLOW),
    [previousFilters, transactions]
  )

  return {
    summary,
    available: previousFilters !== null,
    isLoading: previousFilters !== null && isLoading,
  }
}
