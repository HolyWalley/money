import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../lib/crdts', () => ({
  addTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}))

import {
  db,
  type DexieBrokerAccount,
  type DexieTrade,
  type DexieTransaction,
  type DexieWallet,
} from '../lib/db-dexie'
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

function makeBrokerAccount(overrides: Partial<DexieBrokerAccount> = {}): DexieBrokerAccount {
  return {
    _id: 'broker-1',
    type: 'brokerAccount',
    name: 'Degiro',
    broker: 'degiro',
    cashWalletId: 'wallet-1',
    order: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as DexieBrokerAccount
}

function makeTrade(overrides: Partial<DexieTrade> & { _id: string }): DexieTrade {
  return {
    type: 'trade',
    accountId: 'broker-1',
    kind: 'buy',
    date: new Date('2026-02-01'),
    quantity: 0,
    amount: 0,
    currency: 'USD',
    fee: 0,
    externalId: overrides._id,
    createdAt: new Date('2026-02-01'),
    updatedAt: new Date('2026-02-01'),
    ...overrides,
  } as DexieTrade
}

beforeEach(async () => {
  await db.wallets.clear()
  await db.transactions.clear()
  await db.brokerAccounts.clear()
  await db.trades.clear()
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

  // A statement is stored as trades, never as transactions, so nothing else
  // takes the money a buy spent out of the wallet the broker holds it in.
  it('takes the broker rows out of the wallet holding its cash', async () => {
    await db.wallets.put(makeWallet({ initialBalance: 1000 }))
    await db.brokerAccounts.put(makeBrokerAccount())
    await db.trades.bulkPut([
      makeTrade({ _id: 'trade-1', amount: -900 }),
      makeTrade({ _id: 'trade-2', kind: 'fee', amount: -3 }),
      makeTrade({ _id: 'trade-3', kind: 'dividend', amount: 12 }),
    ])

    expect(await transactionService.getWalletBalance('wallet-1')).toBe(109)
  })

  it('leaves a wallet no broker account claims as its cash alone', async () => {
    await db.wallets.put(makeWallet({ initialBalance: 1000 }))
    await db.brokerAccounts.put(makeBrokerAccount({ cashWalletId: undefined }))
    await db.trades.put(makeTrade({ _id: 'trade-1', amount: -900 }))

    expect(await transactionService.getWalletBalance('wallet-1')).toBe(1000)
  })

  it('ignores a broker row denominated in another currency', async () => {
    await db.wallets.put(makeWallet({ currency: 'USD', initialBalance: 1000 }))
    await db.brokerAccounts.put(makeBrokerAccount())
    await db.trades.bulkPut([
      makeTrade({ _id: 'trade-1', amount: -900 }),
      makeTrade({ _id: 'trade-2', kind: 'dividend', amount: 50, currency: 'EUR' }),
    ])

    expect(await transactionService.getWalletBalance('wallet-1')).toBe(100)
  })

  it('ignores the trades of an account that keeps its cash elsewhere', async () => {
    await db.wallets.put(makeWallet({ initialBalance: 1000 }))
    await db.brokerAccounts.bulkPut([
      makeBrokerAccount(),
      makeBrokerAccount({ _id: 'broker-2', name: 'Revolut', broker: 'revolut', cashWalletId: 'wallet-2' }),
    ])
    await db.trades.bulkPut([
      makeTrade({ _id: 'trade-1', amount: -900 }),
      makeTrade({ _id: 'trade-2', accountId: 'broker-2', amount: -500 }),
    ])

    expect(await transactionService.getWalletBalance('wallet-1')).toBe(100)
  })

  it('throws when the wallet does not exist', async () => {
    await expect(transactionService.getWalletBalance('missing')).rejects.toThrow('Wallet not found')
  })
})
