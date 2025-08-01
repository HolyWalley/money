import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db-dexie'
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfYear, endOfYear, addMonths, addWeeks, addYears, subDays, startOfDay, endOfDay, setDate, setDay, setDayOfYear } from 'date-fns'
import { useMemo, useRef } from 'react'
import type { Transaction } from '../../shared/schemas/transaction.schema'

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
  transactionTypeIds?: string[]
  period?: PeriodFilter
  filterVersion?: string // Add a version/id that changes when filters actually change
}

export const getPeriodDates = (period: PeriodFilter): { start: Date; end: Date } => {
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

// TODO: can we somehow merge all filters into a single loop, not many loops? Maybe not needed, check dexie doc
export function useLiveTransactions(filters: TransactionFilters) {
  const isLoading = useRef(true)

  const categoryIds = useMemo(() => {
    if (!filters.categoryIds) {
      return
    }

    return new Set(filters.categoryIds)
  }, [filters.categoryIds])

  const transactionTypeIds = useMemo(() => {
    if (!filters.transactionTypeIds) {
      return;
    }

    return new Set(filters.transactionTypeIds)
  }, [filters.transactionTypeIds])

  const walletIds = useMemo(() => {
    if (!filters.walletIds) {
      return;
    }

    return new Set(filters.walletIds)
  }, [filters.walletIds])

  const transactions = useLiveQuery(async () => {
    if (filters.isLoading) {
      return []
    }

    let query = db.transactions.orderBy('date').reverse()

    if (categoryIds && categoryIds.size) {
      query = query.filter(t => {
        return t.categoryId ? categoryIds.has(t.categoryId) : false
      })
    }

    if (transactionTypeIds && transactionTypeIds.size) {
      query = query.filter(t => {
        return transactionTypeIds.has(t.transactionType)
      })
    }

    if (walletIds && walletIds.size) {
      query = query.filter(t => {
        return walletIds.has(t.walletId) ||
          (t.toWalletId ? walletIds.has(t.toWalletId) : false)
      })
    }

    if (filters?.period) {
      const { start, end } = getPeriodDates(filters.period)
      query = query.filter(t => {
        return t.date >= start && t.date <= end
      })
    }

    const dexieTransactions = await query.toArray()

    isLoading.current = false

    // Convert Date objects back to ISO strings for components
    return dexieTransactions.map(tx => ({
      ...tx,
      date: tx.date.toISOString(),
      createdAt: tx.createdAt.toISOString(),
      updatedAt: tx.updatedAt.toISOString()
    })) as Transaction[]
  }, [categoryIds, transactionTypeIds, walletIds, filters.isLoading, filters.filterVersion])

  return {
    transactions: transactions || [],
    isLoading: isLoading.current || filters.isLoading,
  }
}
