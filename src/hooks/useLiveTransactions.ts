import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db-dexie'
import { useMemo, useRef } from 'react'
import type { Transaction } from '../../shared/schemas/transaction.schema'
import {
  getPeriodContainingDate,
  getAdjacentPeriod,
  type PeriodType,
  type PeriodSettings,
} from '@/lib/period-utils'

export type { PeriodType } from '@/lib/period-utils'

export interface PeriodFilter {
  type: PeriodType
  startDate?: Date // Deprecated - no longer used
  customFrom?: Date // For custom period
  customTo?: Date // For custom period
  currentPeriod?: number // For navigating through monthly/weekly/yearly periods (0 = current, -1 = previous, etc.)
  monthDay?: number // Day of month (1-31) for monthly periods
  weekDay?: number // Day of week (0=Sunday, 1=Monday) for weekly periods
  yearDay?: number // Day of year (1-366) for yearly periods
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
  const settings: PeriodSettings = {
    type: period.type,
    monthDay: period.monthDay,
    weekDay: period.weekDay,
    yearDay: period.yearDay,
    customFrom: period.customFrom,
    customTo: period.customTo,
  }

  const offset = period.currentPeriod || 0
  const basePeriod = getPeriodContainingDate(new Date(), settings)

  if (offset === 0) {
    return basePeriod
  }

  return getAdjacentPeriod(basePeriod, offset, settings)
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
