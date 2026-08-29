import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../lib/crdts', () => ({
  addTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}))

import { db, type DexieTransaction, type DexieWallet } from '../lib/db-dexie'
import { transactionService } from './transactionService'

function makeWallet(overrides: Partial<DexieWallet> = {}): DexieWallet {
  return {
    _id: 'wallet-1',
    type: 'wallet',
    name: 'Cash',
    currency: 'USD',
    initialBalance: 0,
    isSavings: false,
    order: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as DexieWallet
}

function makeTransaction(overrides: Partial<DexieTransaction> = {}): DexieTransaction {
  return {
    _id: 'tx-1',
    type: 'transaction',
    transactionType: 'expense',
    amount: 10,
    currency: 'USD',
    categoryId: 'category-1',
    walletId: 'wallet-1',
    date: new Date('2026-01-15'),
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-01-15'),
    ...overrides,
  } as DexieTransaction
}

beforeEach(async () => {
  await db.wallets.clear()
  await db.transactions.clear()
})

describe('getWalletBalance', () => {
  it('returns the initial balance when there are no transactions', async () => {
    await db.wallets.put(makeWallet({ initialBalance: 250 }))

    expect(await transactionService.getWalletBalance('wallet-1')).toBe(250)
  })

  it('adds income and subtracts expenses', async () => {
    await db.wallets.put(makeWallet({ initialBalance: 100 }))
    await db.transactions.bulkPut([
      makeTransaction({ _id: 'tx-1', transactionType: 'income', amount: 500 }),
      makeTransaction({ _id: 'tx-2', transactionType: 'expense', amount: 120 }),
      makeTransaction({ _id: 'tx-3', transactionType: 'expense', amount: 30 }),
    ])

    expect(await transactionService.getWalletBalance('wallet-1')).toBe(450)
  })

  it('subtracts outgoing transfers', async () => {
    await db.wallets.put(makeWallet({ initialBalance: 100 }))
    await db.transactions.put(makeTransaction({
      transactionType: 'transfer',
      amount: 40,
      toWalletId: 'wallet-2',
      toCurrency: 'USD',
    }))

    expect(await transactionService.getWalletBalance('wallet-1')).toBe(60)
  })

  it('adds the source amount for incoming same-currency transfers', async () => {
    await db.wallets.put(makeWallet({ _id: 'wallet-2', initialBalance: 0 }))
    await db.transactions.put(makeTransaction({
      transactionType: 'transfer',
      amount: 40,
      currency: 'USD',
      walletId: 'wallet-1',
      toWalletId: 'wallet-2',
      toCurrency: 'USD',
    }))

    expect(await transactionService.getWalletBalance('wallet-2')).toBe(40)
  })

  it('adds the converted amount for incoming cross-currency transfers', async () => {
    await db.wallets.put(makeWallet({ _id: 'wallet-2', currency: 'EUR', initialBalance: 5 }))
    await db.transactions.put(makeTransaction({
      transactionType: 'transfer',
      amount: 100,
      currency: 'USD',
      toAmount: 92,
      toCurrency: 'EUR',
      walletId: 'wallet-1',
      toWalletId: 'wallet-2',
    }))

    expect(await transactionService.getWalletBalance('wallet-2')).toBe(97)
  })

  it('ignores transactions belonging to other wallets', async () => {
    await db.wallets.put(makeWallet({ initialBalance: 100 }))
    await db.transactions.bulkPut([
      makeTransaction({ _id: 'tx-1', transactionType: 'expense', amount: 25 }),
      makeTransaction({ _id: 'tx-2', transactionType: 'expense', amount: 999, walletId: 'wallet-9' }),
      makeTransaction({
        _id: 'tx-3',
        transactionType: 'transfer',
        amount: 999,
        walletId: 'wallet-9',
        toWalletId: 'wallet-8',
        toCurrency: 'USD',
      }),
    ])

    expect(await transactionService.getWalletBalance('wallet-1')).toBe(75)
  })

  it('counts a transaction only once when it matches both wallet sides', async () => {
    await db.wallets.put(makeWallet({ initialBalance: 100 }))
    await db.transactions.put(makeTransaction({
      transactionType: 'transfer',
      amount: 40,
      currency: 'USD',
      walletId: 'wallet-1',
      toWalletId: 'wallet-1',
      toCurrency: 'USD',
    }))

    expect(await transactionService.getWalletBalance('wallet-1')).toBe(100)
  })

  it('throws when the wallet does not exist', async () => {
    await expect(transactionService.getWalletBalance('missing')).rejects.toThrow('Wallet not found')
  })
})
