import { renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { format } from 'date-fns'
import { usePeriodTrend } from './usePeriodTrend'
import type { TransactionFilters } from './useLiveTransactions'
import type { DecoratedTransaction } from './useDecoratedTransactions'

const mocks = vi.hoisted(() => ({
  lastFilters: null as TransactionFilters | null,
  transactions: [] as DecoratedTransaction[],
}))

vi.mock('./useDecoratedTransactions', () => ({
  useDecoratedTransactions: (filters: TransactionFilters) => {
    mocks.lastFilters = filters
    return { transactions: mocks.transactions, isLoading: false }
  },
}))

function expenseOn(day: string, amount: number): DecoratedTransaction {
  return {
    _id: `t-${day}`,
    type: 'transaction',
    transactionType: 'expense',
    amount,
    currency: 'EUR',
    categoryId: 'c-1',
    walletId: 'w-1',
    date: new Date(`${day}T12:00:00`).toISOString(),
    createdAt: new Date(`${day}T12:00:00`).toISOString(),
    updatedAt: new Date(`${day}T12:00:00`).toISOString(),
    amountInBaseCurrency: amount,
  } as DecoratedTransaction
}

function incomeOn(day: string, amount: number): DecoratedTransaction {
  return { ...expenseOn(day, amount), _id: `i-${day}`, transactionType: 'income' }
}

const monthly: TransactionFilters = {
  isLoading: false,
  period: { type: 'monthly', monthDay: 1, currentPeriod: 0 },
}

function months(filters: TransactionFilters, count?: number): string[] {
  const { result } = renderHook(() => usePeriodTrend(filters, count))
  return result.current.points.map(point => format(point.period.start, 'yyyy-MM'))
}

describe('usePeriodTrend', () => {
  beforeEach(() => {
    mocks.lastFilters = null
    mocks.transactions = []
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 15, 9, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs oldest first and ends at the period on screen', () => {
    expect(months(monthly)).toEqual([
      '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
    ])
  })

  it('follows the user back when they navigate to an earlier period', () => {
    const earlier = { ...monthly, period: { type: 'monthly' as const, monthDay: 1, currentPeriod: -2 } }

    expect(months(earlier)).toEqual([
      '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07',
    ])
  })

  it('honours a shorter series', () => {
    expect(months(monthly, 3)).toEqual(['2026-07', '2026-08', '2026-09'])
  })

  // One query over the span rather than one per period, so the rates behind it
  // come back in a single fetch too.
  it('asks for the whole span in one custom range', () => {
    renderHook(() => usePeriodTrend(monthly))

    expect(mocks.lastFilters?.period?.type).toBe('custom')
    expect(format(mocks.lastFilters!.period!.customFrom!, 'yyyy-MM-dd')).toBe('2026-04-01')
    expect(format(mocks.lastFilters!.period!.customTo!, 'yyyy-MM-dd')).toBe('2026-09-30')
  })

  it('splits the span back out into one point per period', () => {
    mocks.transactions = [
      expenseOn('2026-07-04', 100),
      expenseOn('2026-07-20', 50),
      incomeOn('2026-09-01', 3000),
      expenseOn('2026-09-10', 25),
    ]

    const { result } = renderHook(() => usePeriodTrend(monthly))
    const byMonth = new Map(
      result.current.points.map(point => [format(point.period.start, 'yyyy-MM'), point])
    )

    expect(byMonth.get('2026-07')).toMatchObject({ income: 0, expense: 150 })
    expect(byMonth.get('2026-09')).toMatchObject({ income: 3000, expense: 25 })
    expect(byMonth.get('2026-08')).toMatchObject({ income: 0, expense: 0 })
  })

  it('leaves out a transaction falling outside every period', () => {
    mocks.transactions = [expenseOn('2025-01-15', 999)]

    const { result } = renderHook(() => usePeriodTrend(monthly))

    expect(result.current.points.every(point => point.expense === 0)).toBe(true)
  })

  it('steps by week for a weekly period', () => {
    const weekly: TransactionFilters = {
      isLoading: false,
      period: { type: 'weekly', weekDay: 1, currentPeriod: 0 },
    }

    const { result } = renderHook(() => usePeriodTrend(weekly, 3))
    const starts = result.current.points.map(point => format(point.period.start, 'yyyy-MM-dd'))

    expect(starts).toEqual(['2026-08-31', '2026-09-07', '2026-09-14'])
  })

  // A rolling window is the same window however far you step back, and six
  // copies of one bar is not a trend.
  it('has no series for a rolling period', () => {
    const { result } = renderHook(() =>
      usePeriodTrend({ isLoading: false, period: { type: 'last30days' } })
    )

    expect(result.current.available).toBe(false)
    expect(result.current.points).toEqual([])
  })

  it('has no series before a period is chosen', () => {
    const { result } = renderHook(() => usePeriodTrend({ isLoading: true }))

    expect(result.current.available).toBe(false)
  })

  it('has no series worth drawing when only one period is asked for', () => {
    const { result } = renderHook(() => usePeriodTrend(monthly, 1))

    expect(result.current.available).toBe(false)
  })
})
