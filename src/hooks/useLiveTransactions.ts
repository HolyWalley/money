import { useMemo, useSyncExternalStore } from 'react'
import { db } from '@/lib/db-dexie'
import { documentReady } from '@/lib/document-ready'
import { createSharedLiveQuery } from '@/lib/shared-live-query'
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
  categoryIds?: string[]
  walletIds?: string[]
  transactionTypeIds?: string[]
  period?: PeriodFilter
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

export const EMPTY_TRANSACTIONS: Transaction[] = []

export const transactionsStore = createSharedLiveQuery(async () => {
  const dexieTransactions = await db.transactions.orderBy('date').reverse().toArray()
  // Convert Date objects back to ISO strings for components
  return dexieTransactions.map(tx => ({
    ...tx,
    date: tx.date.toISOString(),
    createdAt: tx.createdAt.toISOString(),
    updatedAt: tx.updatedAt.toISOString()
  })) as Transaction[]
}, { after: documentReady, name: 'transactions' })

interface TransactionSelection {
  categoryIds: string[] | null
  walletIds: string[] | null
  transactionTypeIds: string[] | null
  period: { start: number; end: number } | null
}

const sorted = (ids: string[] | undefined): string[] | null => (ids ? [...ids].sort() : null)

/**
 * The filters as a string, so two objects asking for the same rows compare
 * equal: the ids in whatever order they were ticked, and the period resolved
 * to its instants, since "this month" is a different window tomorrow.
 */
export function transactionsKey(filters: TransactionFilters | null): string {
  if (filters === null) return 'null'

  const period = filters.period ? getPeriodDates(filters.period) : null
  const selection: TransactionSelection = {
    categoryIds: sorted(filters.categoryIds),
    walletIds: sorted(filters.walletIds),
    transactionTypeIds: sorted(filters.transactionTypeIds),
    period: period ? { start: period.start.getTime(), end: period.end.getTime() } : null,
  }
  return JSON.stringify(selection)
}

// An empty id list has always meant no filter rather than no rows.
const toSet = (ids: string[] | null): Set<string> | null => (ids && ids.length ? new Set(ids) : null)

function selectTransactions(all: Transaction[], selection: TransactionSelection): Transaction[] {
  const categoryIds = toSet(selection.categoryIds)
  const transactionTypeIds = toSet(selection.transactionTypeIds)
  const walletIds = toSet(selection.walletIds)
  const { period } = selection

  return all.filter(t => {
    if (categoryIds && !categoryIds.has(t.categoryId)) return false
    if (transactionTypeIds && !transactionTypeIds.has(t.transactionType)) return false
    if (walletIds && !walletIds.has(t.walletId) && !(t.toWalletId && walletIds.has(t.toWalletId))) return false
    if (period) {
      const time = Date.parse(t.date)
      if (time < period.start || time > period.end) return false
    }
    return true
  })
}

const subscribeToNothing = () => () => {}
const readNothing = () => EMPTY_TRANSACTIONS

export function useLiveTransactions(filters: TransactionFilters | null): Transaction[] {
  // The store hook is a `useSyncExternalStore` and a `use()`. Null takes the
  // same hook on a source that never changes, so the order holds when filters
  // go from null to set while mounted - a rolling period becoming a monthly
  // one - without starting a query nobody asked for.
  const all = filters === null
    // eslint-disable-next-line react-hooks/rules-of-hooks
    ? useSyncExternalStore(subscribeToNothing, readNothing, readNothing)
    : transactionsStore()

  const key = transactionsKey(filters)
  // Keyed on the serialised filters rather than the object: a provider hands
  // out a fresh one per render, and equal filters must hand back equal rows.
  const selection = useMemo(() => JSON.parse(key) as TransactionSelection | null, [key])

  return useMemo(
    () => (selection === null ? EMPTY_TRANSACTIONS : selectTransactions(all, selection)),
    [all, selection]
  )
}
