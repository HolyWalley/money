import { act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db-dexie'
import { resetSharedLiveQueries } from '@/lib/shared-live-query'
import { renderHookSuspended } from '@/test/suspense'
import { transactionService } from '@/services/transactionService'
import { useWalletBalances } from './useWalletBalances'
import { useWalletBalance } from './useWalletBalance'

vi.mock('@/lib/document-ready', () => ({ documentReady: Promise.resolve() }))

const now = new Date()

function wallet(id: string, currency: string, initialBalance: number, isSavings = false) {
  return { _id: id, type: 'wallet', name: id, currency, initialBalance, isSavings, order: 0, createdAt: now, updatedAt: now }
}

interface Money {
  amount: number
  currency: string
  toAmount?: number
  toCurrency?: string
}

function transaction(id: string, transactionType: string, walletId: string, money: Money, toWalletId?: string) {
  return {
    _id: id,
    type: 'transaction',
    transactionType,
    categoryId: 'c-1',
    walletId,
    toWalletId,
    ...money,
    date: now,
    createdAt: now,
    updatedAt: now,
  }
}

function trade(id: string, accountId: string, amount: number, currency: string) {
  return {
    _id: id,
    type: 'trade',
    accountId,
    kind: amount < 0 ? 'buy' : 'dividend',
    date: now,
    quantity: 0,
    amount,
    currency,
    fee: 0,
    externalId: id,
    createdAt: now,
    updatedAt: now,
  }
}

const WALLETS = ['w-eur', 'w-usd', 'w-cash', 'w-savings']

async function loadBalances() {
  const rendered = await renderHookSuspended(() => useWalletBalances())
  await waitFor(() => expect(rendered.result.current).not.toBeNull())
  return rendered
}

describe('useWalletBalances', () => {
  beforeEach(async () => {
    resetSharedLiveQueries()
    await Promise.all([
      db.wallets.clear(),
      db.transactions.clear(),
      db.brokerAccounts.clear(),
      db.trades.clear(),
    ])

    await db.wallets.bulkAdd([
      wallet('w-eur', 'EUR', 100),
      wallet('w-usd', 'USD', 50),
      wallet('w-cash', 'EUR', 0),
      wallet('w-savings', 'EUR', 0, true),
    ] as never)
    await db.transactions.bulkAdd([
      transaction('t-1', 'income', 'w-eur', { amount: 1000, currency: 'EUR' }),
      transaction('t-2', 'expense', 'w-eur', { amount: 250, currency: 'EUR' }),
      transaction('t-3', 'transfer', 'w-eur', { amount: 200, currency: 'EUR', toCurrency: 'EUR' }, 'w-savings'),
      transaction('t-4', 'transfer', 'w-eur', { amount: 100, currency: 'EUR', toAmount: 110, toCurrency: 'USD' }, 'w-usd'),
      transaction('t-5', 'transfer', 'w-eur', { amount: 300, currency: 'EUR', toCurrency: 'EUR' }, 'w-cash'),
      // Both sides of one transfer: paid out and back in, so nothing moves.
      transaction('t-6', 'transfer', 'w-usd', { amount: 40, currency: 'USD', toCurrency: 'USD' }, 'w-usd'),
    ] as never)
    await db.brokerAccounts.bulkAdd([
      { _id: 'ba-1', type: 'brokerAccount', name: 'DeGiro', broker: 'degiro', cashWalletId: 'w-cash', order: 0, createdAt: now, updatedAt: now },
      { _id: 'ba-2', type: 'brokerAccount', name: 'Revolut', broker: 'revolut', order: 1, createdAt: now, updatedAt: now },
    ] as never)
    await db.trades.bulkAdd([
      trade('tr-1', 'ba-1', -120, 'EUR'),
      trade('tr-2', 'ba-1', 15, 'EUR'),
      // Not the wallet's currency: the broker never states it in EUR.
      trade('tr-3', 'ba-1', -5, 'USD'),
      // No cash wallet to answer for it.
      trade('tr-4', 'ba-2', -999, 'EUR'),
    ] as never)
  })

  it('answers every wallet the way the service did', async () => {
    const { result } = await loadBalances()

    for (const id of WALLETS) {
      expect(result.current.get(id), id).toBe(await transactionService.getWalletBalance(id))
    }
  })

  it('spends a broker cash wallet down by the broker\'s own rows', async () => {
    const { result } = await loadBalances()

    expect(result.current.get('w-cash')).toBe(300 - 120 + 15)
    expect(result.current.get('w-eur')).toBe(100 + 1000 - 250 - 200 - 100 - 300)
    expect(result.current.get('w-usd')).toBe(50 + 110)
    expect(result.current.get('w-savings')).toBe(200)
  })

  it('follows a write', async () => {
    const { result } = await loadBalances()

    await act(async () => {
      await db.transactions.add(transaction('t-7', 'expense', 'w-savings', { amount: 25, currency: 'EUR' }) as never)
    })

    await waitFor(() => expect(result.current.get('w-savings')).toBe(175))
  })

  describe('useWalletBalance', () => {
    it('reads one wallet off the same pass', async () => {
      const { result } = await renderHookSuspended(() => useWalletBalance('w-cash'))

      await waitFor(() => expect(result.current).toBe(195))
    })

    it('is zero for a wallet it does not know', async () => {
      const { result } = await renderHookSuspended(() => useWalletBalance('w-missing'))

      await waitFor(() => expect(result.current).not.toBeNull())
      expect(result.current).toBe(0)
    })
  })
})
