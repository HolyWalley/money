import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db-dexie'
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfYear, endOfYear, addMonths, addWeeks, addYears, subDays, startOfDay, endOfDay, setDate, setDay, setDayOfYear } from 'date-fns'

export type PeriodType = 'monthly' | 'weekly' | 'yearly' | 'last7days' | 'last30days' | 'last365days' | 'custom'

export interface PeriodFilter {
  type: PeriodType
  startDate?: Date // For monthly/weekly/yearly - the period start reference
  customFrom?: Date // For custom period
  customTo?: Date // For custom period
  currentPeriod?: number // For navigating through monthly/weekly/yearly periods (0 = current, -1 = previous, etc.)
  monthDay?: number // Day of month (1-30) for monthly periods
  weekDay?: number // Day of week (0=Sunday, 1=Monday) for weekly periods
  yearDay?: number // Day of year (1-365) for yearly periods
}

export interface TransactionFilters {
  isLoading: boolean
  categoryIds?: string[]
  walletIds?: string[]
  period?: PeriodFilter
  filterVersion?: string // Add a version/id that changes when filters actually change
}

export function useLiveTransactions(filters: TransactionFilters) {
  const getPeriodDates = (period: PeriodFilter): { start: Date; end: Date } => {
    const baseDate = period.startDate || new Date()
    const offset = period.currentPeriod || 0

    switch (period.type) {
      case 'monthly': {
        const targetDate = addMonths(baseDate, offset)
        const monthStart = startOfMonth(targetDate)
        const actualStart = period.monthDay ? setDate(monthStart, period.monthDay) : monthStart
        return {
          start: startOfDay(actualStart),
          end: endOfDay(endOfMonth(targetDate))
        }
      }
      case 'weekly': {
        const targetDate = addWeeks(baseDate, offset)
        const weekStart = startOfWeek(targetDate)
        const actualStart = period.weekDay !== undefined ? setDay(weekStart, period.weekDay) : weekStart
        return {
          start: startOfDay(actualStart),
          end: endOfDay(endOfWeek(targetDate))
        }
      }
      case 'yearly': {
        const targetDate = addYears(baseDate, offset)
        const yearStart = startOfYear(targetDate)
        const actualStart = period.yearDay ? setDayOfYear(yearStart, period.yearDay) : yearStart
        return {
          start: startOfDay(actualStart),
          end: endOfDay(endOfYear(targetDate))
        }
      }
      case 'last7days': {
        const end = endOfDay(new Date())
        const start = startOfDay(subDays(new Date(), 6))
        return { start, end }
      }
      case 'last30days': {
        const end = endOfDay(new Date())
        const start = startOfDay(subDays(new Date(), 29))
        return { start, end }
      }
      case 'last365days': {
        const end = endOfDay(new Date())
        const start = startOfDay(subDays(new Date(), 364))
        return { start, end }
      }
      case 'custom': {
        return {
          start: startOfDay(period.customFrom || new Date()),
          end: endOfDay(period.customTo || new Date())
        }
      }
      default:
        return { start: new Date(), end: new Date() }
    }
  }

  const transactions = useLiveQuery(() => {
    if (filters.isLoading) {
      return []
    }

    let query = db.transactions.orderBy('date').reverse()

    if (filters?.categoryIds && filters.categoryIds.length > 0) {
      query = query.filter(t => {
        return t.categoryId ? filters.categoryIds!.includes(t.categoryId) : false
      })
    }

    if (filters?.walletIds && filters.walletIds.length > 0) {
      query = query.filter(t => {
        return filters.walletIds!.includes(t.walletId) ||
          (t.toWalletId ? filters.walletIds!.includes(t.toWalletId) : false)
      })
    }

    if (filters?.period) {
      const { start, end } = getPeriodDates(filters.period)
      query = query.filter(t => {
        const transactionDate = new Date(t.date)
        return transactionDate >= start && transactionDate <= end
      })
    }

    return query.toArray()
  }, [filters.isLoading, filters.filterVersion])

  return {
    transactions: transactions || [],
    isLoading: (transactions === undefined) || filters.isLoading,
  }
}
