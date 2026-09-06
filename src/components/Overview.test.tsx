import { act, waitFor } from '@testing-library/react'
import { startOfMonth, setHours } from 'date-fns'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db-dexie'
import { resetSharedLiveQueries } from '@/lib/shared-live-query'
import { mountSuspended } from '@/test/suspense'
import type { CommittedAmounts } from './overview/BalanceSummaryCard'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { settings: { defaultCurrency: 'USD' } } }),
}))

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))

// Nothing here is in a foreign currency, so no rate is ever asked for; the
// stub only keeps a slip in the seed off the network.
vi.mock('@/lib/exchange-rate-service', () => ({
  getExchangeRateService: () => ({ getRates: async () => new Map<string, number>() }),
}))

interface LedgerEntry {
  total: number
  commitments: CommittedAmounts | null
  isLoading: boolean
}

const { ledger } = vi.hoisted(() => ({ ledger: [] as LedgerEntry[] }))

// A props ledger: every set of figures the card was asked to show, in order.
// Memoized like the real export, so an entry means a prop actually changed.
vi.mock('./overview/BalanceSummaryCard', async () => {
  const { memo, useEffect } = await import('react')
  return {
    BalanceSummaryCard: memo((props: LedgerEntry) => {
      useEffect(() => {
        ledger.push({ total: props.total, commitments: props.commitments, isLoading: props.isLoading })
      })
      return null
    }),
  }
})

// Charts and the virtual list measure themselves against a layout jsdom does not have.
vi.mock('./overview/CashflowTrendChart', () => ({ CashflowTrendChart: () => null }))
vi.mock('./ExpensesByCategoryChart', () => ({ ExpensesByCategoryChart: () => null }))
vi.mock('./transactions/VirtualizedTransactionList', () => ({ VirtualizedTransactionList: () => null }))

const { Overview } = await import('./Overview')

const now = new Date()

beforeEach(async () => {
  resetSharedLiveQueries()
  localStorage.clear()
  ledger.length = 0

  await Promise.all([
    db.wallets.clear(),
    db.categories.clear(),
    db.transactions.clear(),
    db.recurringPayments.clear(),
    db.recurringPaymentLogs.clear(),
    db.savingGoals.clear(),
    db.brokerAccounts.clear(),
    db.trades.clear(),
    db.instruments.clear(),
  ])

  await db.wallets.add({
    _id: 'w1', name: 'Cash', currency: 'USD', initialBalance: 100, order: 0, createdAt: now, updatedAt: now,
  } as never)
  await db.categories.bulkAdd([
    { _id: 'c-income', name: 'Salary', type: 'income', order: 0, createdAt: now, updatedAt: now },
    { _id: 'c-expense', name: 'Rent', type: 'expense', order: 0, createdAt: now, updatedAt: now },
  ] as never)
  await db.transactions.add({
    _id: 't1', walletId: 'w1', categoryId: 'c-income', transactionType: 'income',
    amount: 50, currency: 'USD', date: now, createdAt: now, updatedAt: now,
  } as never)
  // Due this month and never logged, so the period still owes it.
  await db.recurringPayments.add({
    _id: 'rp1', amount: 30, currency: 'USD', categoryId: 'c-expense', walletId: 'w1',
    transactionType: 'expense', description: 'Rent', rrule: 'FREQ=MONTHLY',
    startDate: setHours(startOfMonth(now), 12), isActive: true, sourceTransactionId: 't0',
    createdAt: now, updatedAt: now,
  } as never)
})

describe('Overview', () => {
  // The balance card must never be handed figures that are not ready: a total
  // that lands before its commitments reads as a jump in what is free to
  // spend. Every entry here is complete; how many there are is pinned once
  // the rates hooks stop re-rendering the card (commit B).
  it('hands the balance card its commitments with the total, never after it', async () => {
    await mountSuspended(<Overview />)

    await waitFor(() => expect(ledger.length).toBeGreaterThan(0))
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 200))
    })

    expect(ledger[0].total).toBe(150)
    expect(ledger[0].commitments).toEqual({ recurring: 30, savings: 0, total: 30 })
    for (const entry of ledger) {
      expect(entry.total).toBe(150)
      expect(entry.commitments).toEqual({ recurring: 30, savings: 0, total: 30 })
    }
  })
})
