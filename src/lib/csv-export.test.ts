import { describe, it, expect } from 'vitest'
import { UTCDate } from '@date-fns/utc'
import { buildTransactionsCsv } from './csv-export'
import type { DecoratedTransaction } from '@/hooks/useDecoratedTransactions'
import type { Category } from 'shared/schemas/category.schema'
import type { Wallet } from 'shared/schemas/wallet.schema'

function makeTransaction(overrides: Partial<DecoratedTransaction> = {}): DecoratedTransaction {
  return {
    _id: '1',
    type: 'transaction',
    transactionType: 'expense',
    amount: 100,
    currency: 'PLN',
    categoryId: 'cat1',
    walletId: 'w1',
    date: new UTCDate('2026-03-15T10:00:00.000Z').toISOString(),
    createdAt: new UTCDate('2026-03-15T10:00:00.000Z').toISOString(),
    updatedAt: new UTCDate('2026-03-15T10:00:00.000Z').toISOString(),
    amountInBaseCurrency: 100,
    ...overrides,
  }
}

const categories: Category[] = [
  { _id: 'cat1', type: 'expense', name: 'Food', icon: 'utensils', color: 'green', isDefault: false, order: 0, createdAt: '', updatedAt: '' },
  { _id: 'cat2', type: 'income', name: 'Salary', icon: 'wallet', color: 'blue', isDefault: false, order: 1, createdAt: '', updatedAt: '' },
]

const wallets: Wallet[] = [
  { _id: 'w1', type: 'wallet', name: 'Cash', currency: 'PLN', initialBalance: 0, order: 0, createdAt: '', updatedAt: '' },
  { _id: 'w2', type: 'wallet', name: 'Bank', currency: 'PLN', initialBalance: 0, order: 1, createdAt: '', updatedAt: '' },
]

describe('buildTransactionsCsv', () => {
  it('builds csv with headers and expense row', () => {
    const csv = buildTransactionsCsv([makeTransaction()], categories, wallets, 'PLN')
    const lines = csv.split('\n')

    expect(lines[0]).toBe('Date,Type,Category,Wallet,To Wallet,Note,Amount,Currency,Amount (PLN)')
    expect(lines[1]).toBe('2026-03-15,expense,Food,Cash,,,100.00,PLN,100.00')
  })

  it('includes transfer with to wallet', () => {
    const csv = buildTransactionsCsv(
      [makeTransaction({
        transactionType: 'transfer',
        toWalletId: 'w2',
        note: 'Transfer funds',
      })],
      categories,
      wallets,
      'PLN',
    )
    const lines = csv.split('\n')

    expect(lines[1]).toBe('2026-03-15,transfer,Food,Cash,Bank,Transfer funds,100.00,PLN,100.00')
  })

  it('escapes fields with commas and quotes', () => {
    const csv = buildTransactionsCsv(
      [makeTransaction({ note: 'Food, drinks and "snacks"' })],
      categories,
      wallets,
      'PLN',
    )
    const lines = csv.split('\n')

    expect(lines[1]).toContain('"Food, drinks and ""snacks"""')
  })

  it('omits base currency column when baseCurrency is undefined', () => {
    const csv = buildTransactionsCsv([makeTransaction()], categories, wallets, undefined)
    const lines = csv.split('\n')

    expect(lines[0]).toBe('Date,Type,Category,Wallet,To Wallet,Note,Amount,Currency')
    expect(lines[1]).toBe('2026-03-15,expense,Food,Cash,,,100.00,PLN')
  })

  it('handles null amountInBaseCurrency', () => {
    const csv = buildTransactionsCsv(
      [makeTransaction({ amountInBaseCurrency: null })],
      categories,
      wallets,
      'PLN',
    )
    const lines = csv.split('\n')

    expect(lines[1]).toBe('2026-03-15,expense,Food,Cash,,,100.00,PLN,')
  })

  it('handles multiple transactions', () => {
    const csv = buildTransactionsCsv(
      [
        makeTransaction({ _id: '1', amount: 50, note: 'Lunch' }),
        makeTransaction({ _id: '2', amount: 200, categoryId: 'cat2', transactionType: 'income', note: 'Pay' }),
      ],
      categories,
      wallets,
      'PLN',
    )
    const lines = csv.split('\n')

    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('50.00')
    expect(lines[2]).toContain('Salary')
  })

  it('handles unknown category and wallet ids', () => {
    const csv = buildTransactionsCsv(
      [makeTransaction({ categoryId: 'unknown', walletId: 'unknown' })],
      categories,
      wallets,
      'PLN',
    )
    const lines = csv.split('\n')

    expect(lines[1]).toBe('2026-03-15,expense,,,,,100.00,PLN,100.00')
  })

  it('escapes fields with newlines', () => {
    const csv = buildTransactionsCsv(
      [makeTransaction({ note: 'Line 1\nLine 2' })],
      categories,
      wallets,
      'PLN',
    )
    const dataAfterHeader = csv.split('\n').slice(1).join('\n')

    expect(dataAfterHeader).toContain('"Line 1\nLine 2"')
  })
})
