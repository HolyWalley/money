import { renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePreviousPeriodCashflow } from './usePeriodComparison'
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

function tx(overrides: Partial<DecoratedTransaction>): DecoratedTransaction {
  return {
    _id: 't-1',
    type: 'transaction',
    transactionType: 'expense',
    amount: 100,
    currency: 'EUR',
    categoryId: 'c-1',
    walletId: 'w-1',
    date: '2026-08-05T12:00:00.000Z',
    createdAt: '2026-08-05T12:00:00.000Z',
    updatedAt: '2026-08-05T12:00:00.000Z',
    amountInBaseCurrency: 100,
    ...overrides,
  } as DecoratedTransaction
}

const monthly: TransactionFilters = {
  isLoading: false,
  period: { type: 'monthly', monthDay: 1, currentPeriod: 0 },
}

describe('usePreviousPeriodCashflow', () => {
  beforeEach(() => {
    mocks.lastFilters = null
    mocks.transactions = []
  })

  it('reads the period one step back', () => {
    renderHook(() => usePreviousPeriodCashflow(monthly))

    expect(mocks.lastFilters?.period?.currentPeriod).toBe(-1)
  })

  it('steps back from wherever the user has already navigated to', () => {
    renderHook(() =>
      usePreviousPeriodCashflow({ ...monthly, period: { type: 'monthly', monthDay: 1, currentPeriod: -2 } })
    )

    expect(mocks.lastFilters?.period?.currentPeriod).toBe(-3)
  })

  it('carries the other filters across so both periods are counted the same way', () => {
    renderHook(() => usePreviousPeriodCashflow({ ...monthly, walletIds: ['w-1'], categoryIds: ['c-1'] }))

    expect(mocks.lastFilters?.walletIds).toEqual(['w-1'])
    expect(mocks.lastFilters?.categoryIds).toEqual(['c-1'])
  })

  it('summarizes what the previous period did', () => {
    mocks.transactions = [
      tx({ transactionType: 'income', amount: 3000, amountInBaseCurrency: 3000 }),
      tx({ _id: 't-2', amount: 200, amountInBaseCurrency: 200 }),
    ]

    const { result } = renderHook(() => usePreviousPeriodCashflow(monthly))

    expect(result.current.summary.income).toBe(3000)
    expect(result.current.summary.expense).toBe(200)
    expect(result.current.available).toBe(true)
  })

  // Stepping back a rolling window hands the same window straight back, so the
  // comparison would be the period against itself and always read as no change.
  it('has nothing to compare a rolling period against', () => {
    const { result } = renderHook(() =>
      usePreviousPeriodCashflow({ isLoading: false, period: { type: 'last30days' } })
    )

    expect(result.current.available).toBe(false)
  })

  it('has nothing to compare a custom range against', () => {
    const { result } = renderHook(() =>
      usePreviousPeriodCashflow({ isLoading: false, period: { type: 'custom' } })
    )

    expect(result.current.available).toBe(false)
  })

  it('has nothing to compare before a period is chosen', () => {
    const { result } = renderHook(() => usePreviousPeriodCashflow({ isLoading: true }))

    expect(result.current.available).toBe(false)
  })

  it('reports empty totals rather than the current period when unavailable', () => {
    mocks.transactions = [tx({ amount: 999, amountInBaseCurrency: 999 })]

    const { result } = renderHook(() =>
      usePreviousPeriodCashflow({ isLoading: false, period: { type: 'last30days' } })
    )

    expect(result.current.summary.expense).toBe(0)
  })

  it('is not loading when there is nothing to load', () => {
    const { result } = renderHook(() =>
      usePreviousPeriodCashflow({ isLoading: false, period: { type: 'last7days' } })
    )

    expect(result.current.isLoading).toBe(false)
  })
})
