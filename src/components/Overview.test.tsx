import { act, screen, waitFor } from '@testing-library/react'
import { startOfMonth, setHours } from 'date-fns'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  ExchangeRateService,
  type ExchangeRateProvider,
  type ExchangeRateValue,
} from '../../shared/exchange-rates'
import { db } from '@/lib/db-dexie'
import { IndexedDBExchangeRateCache } from '@/lib/exchange-rate-cache-indexeddb'
import { resetSharedLiveQueries } from '@/lib/shared-live-query'
import { resetResources } from '@/lib/suspense-resource'
import { deferred, mountSuspended } from '@/test/suspense'
import type { CommittedAmounts } from './overview/BalanceSummaryCard'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { settings: { defaultCurrency: 'USD' } } }),
}))

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))

const mocks = vi.hoisted(() => ({ service: null as ExchangeRateService | null }))

// The real service over the real cache; only the provider is a stub, so the
// rates go through the same cold-cache read the page makes in production.
vi.mock('@/lib/exchange-rate-service', () => ({
  getExchangeRateService: () => mocks.service,
}))

interface LedgerEntry {
  total: number
  commitments: CommittedAmounts | null
}

const { ledger } = vi.hoisted(() => ({ ledger: [] as LedgerEntry[] }))

// A props ledger: every set of figures the card was asked to show, in order.
// The stub is memoized so that an entry means the figures changed, not merely
// that the page rendered again - a re-render with equal props shows the user
// nothing. The real card is a plain export and has no need to be memoized.
vi.mock('./overview/BalanceSummaryCard', async () => {
  const { memo, useEffect } = await import('react')
  return {
    BalanceSummaryCard: memo((props: LedgerEntry) => {
      useEffect(() => {
        ledger.push({ total: props.total, commitments: props.commitments })
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

/** Four PLN to the dollar on every day asked for. */
function publish(
  baseCurrency: string,
  currencies: string[],
  from: Date,
  to: Date
): Map<string, ExchangeRateValue> {
  const rates = new Map<string, ExchangeRateValue>()
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()))
  while (cursor <= end) {
    const day = cursor.toISOString().split('T')[0]
    for (const currency of currencies) {
      rates.set(ExchangeRateService.createCacheKey(baseCurrency, currency, day), { rate: 4, expiresAt: null })
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return rates
}

let gate: ReturnType<typeof deferred<void>>
let getRates: ReturnType<typeof vi.fn<ExchangeRateProvider['getRates']>>

beforeEach(async () => {
  resetSharedLiveQueries()
  resetResources()
  localStorage.clear()
  ledger.length = 0

  // The provider answers whatever it is asked, once the test lets it.
  gate = deferred<void>()
  getRates = vi.fn<ExchangeRateProvider['getRates']>((baseCurrency, currencies, from, to) =>
    gate.promise.then(() => publish(baseCurrency, currencies, from, to))
  )
  mocks.service = new ExchangeRateService({ getRate: vi.fn(), getRates }, new IndexedDBExchangeRateCache())

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
    db.exchangeRates.clear(),
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
  // Both due this month and never logged, so the period still owes them. The
  // second is in a currency the card cannot show without a rate.
  await db.recurringPayments.bulkAdd([
    {
      _id: 'rp1', amount: 30, currency: 'USD', categoryId: 'c-expense', walletId: 'w1',
      transactionType: 'expense', description: 'Rent', rrule: 'FREQ=MONTHLY',
      startDate: setHours(startOfMonth(now), 12), isActive: true, sourceTransactionId: 't0',
      createdAt: now, updatedAt: now,
    },
    {
      _id: 'rp2', amount: 400, currency: 'PLN', categoryId: 'c-expense', walletId: 'w1',
      transactionType: 'expense', description: 'Gym', rrule: 'FREQ=MONTHLY',
      startDate: setHours(startOfMonth(now), 12), isActive: true, sourceTransactionId: 't0',
      createdAt: now, updatedAt: now,
    },
  ] as never)
})

describe('Overview', () => {
  // The balance card must never be handed figures that are not ready: a total
  // that lands before its commitments, or a commitment shown before its rate,
  // reads as a jump in what is free to spend. So the card is not rendered at
  // all until the rate is in, and then exactly once, with everything.
  it('hands the balance card its commitments with the total, never after it', async () => {
    await mountSuspended(<Overview />)

    await waitFor(() => expect(getRates).toHaveBeenCalledTimes(1))
    expect(getRates.mock.calls[0].slice(0, 2)).toEqual(['USD', ['PLN']])
    expect(screen.getByTestId('fallback')).toBeInTheDocument()
    expect(ledger).toHaveLength(0)

    await act(async () => {
      gate.resolve()
    })

    await waitFor(() => expect(ledger.length).toBeGreaterThan(0))
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 200))
    })

    expect(screen.queryByTestId('fallback')).toBeNull()
    expect(ledger).toEqual([{ total: 150, commitments: { recurring: 130, savings: 0, total: 130 } }])
  })

  // Read where they are used, the balance's rates would not be asked for until
  // the transactions' had answered, and a cold start would wait out one round
  // trip after the other.
  it('asks for the balance rates while the transaction rates are still out', async () => {
    await db.wallets.add({
      _id: 'w2', name: 'Euro', currency: 'EUR', initialBalance: 0, order: 1, createdAt: now, updatedAt: now,
    } as never)
    await db.transactions.add({
      _id: 't2', walletId: 'w2', categoryId: 'c-expense', transactionType: 'expense',
      amount: 20, currency: 'PLN', date: now, createdAt: now, updatedAt: now,
    } as never)

    await mountSuspended(<Overview />)

    // Both out at once, and the page still waiting: the wallet's EUR rate is
    // only reached after the transactions' PLN one when the two run in turn.
    await waitFor(() => {
      const asked = getRates.mock.calls.map(call => call[1])
      expect(asked).toContainEqual(['PLN'])
      expect(asked).toContainEqual(['EUR'])
    })
    expect(screen.getByTestId('fallback')).toBeInTheDocument()

    await act(async () => {
      gate.resolve()
    })
    await waitFor(() => expect(screen.queryByTestId('fallback')).toBeNull())
  })
})
