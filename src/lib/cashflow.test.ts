import { describe, it, expect } from 'vitest'
import { summarizeCashflow } from './cashflow'
import type { DecoratedTransaction } from '@/hooks/useDecoratedTransactions'

function tx(overrides: Partial<DecoratedTransaction>): DecoratedTransaction {
  return {
    _id: 't-1',
    type: 'transaction',
    transactionType: 'expense',
    amount: 100,
    currency: 'EUR',
    categoryId: 'c-1',
    walletId: 'w-1',
    date: '2026-09-05T12:00:00.000Z',
    createdAt: '2026-09-05T12:00:00.000Z',
    updatedAt: '2026-09-05T12:00:00.000Z',
    amountInBaseCurrency: 100,
    ...overrides,
  } as DecoratedTransaction
}

describe('summarizeCashflow', () => {
  it('is all zeroes for no transactions', () => {
    const summary = summarizeCashflow([])

    expect(summary.income).toBe(0)
    expect(summary.expense).toBe(0)
    expect(summary.cashFlow).toBe(0)
    expect(summary.expensesByCategory.size).toBe(0)
  })

  it('totals income and expense and nets them into cash flow', () => {
    const summary = summarizeCashflow([
      tx({ transactionType: 'income', amount: 3000, amountInBaseCurrency: 3000 }),
      tx({ _id: 't-2', amount: 200, amountInBaseCurrency: 200 }),
    ])

    expect(summary.income).toBe(3000)
    expect(summary.expense).toBe(200)
    expect(summary.cashFlow).toBe(2800)
  })

  // Money coming back is not money earned - counting it would inflate both the
  // income figure and the savings picture built on top of it.
  it('leaves reimbursement income out of income', () => {
    const summary = summarizeCashflow([
      tx({ transactionType: 'income', amount: 50, amountInBaseCurrency: 50, reimbursement: true }),
    ])

    expect(summary.income).toBe(0)
  })

  it('ignores transfers entirely', () => {
    const summary = summarizeCashflow([
      tx({ transactionType: 'transfer', amount: 500, amountInBaseCurrency: 500, toWalletId: 'w-2' }),
    ])

    expect(summary.income).toBe(0)
    expect(summary.expense).toBe(0)
  })

  it('counts only your share of a split expense', () => {
    const summary = summarizeCashflow([
      tx({ amount: 100, amountInBaseCurrency: 100, split: true, parts: [{ amount: 25 }, { amount: 75 }] }),
    ])

    expect(summary.expense).toBe(25)
    expect(summary.expensesByCategory.get('c-1')).toBe(25)
  })

  // No rate means no honest figure, and a zero would read as "spent nothing".
  it('skips a transaction that could not be converted', () => {
    const summary = summarizeCashflow([
      tx({ amountInBaseCurrency: null }),
      tx({ _id: 't-2', amount: 40, amountInBaseCurrency: 40 }),
    ])

    expect(summary.expense).toBe(40)
  })

  it('groups expenses by category', () => {
    const summary = summarizeCashflow([
      tx({ amount: 100, amountInBaseCurrency: 100, categoryId: 'food' }),
      tx({ _id: 't-2', amount: 40, amountInBaseCurrency: 40, categoryId: 'food' }),
      tx({ _id: 't-3', amount: 25, amountInBaseCurrency: 25, categoryId: 'transport' }),
    ])

    expect(summary.expensesByCategory.get('food')).toBe(140)
    expect(summary.expensesByCategory.get('transport')).toBe(25)
  })

  it('keeps income out of the category breakdown', () => {
    const summary = summarizeCashflow([
      tx({ transactionType: 'income', amount: 3000, amountInBaseCurrency: 3000, categoryId: 'salary' }),
    ])

    expect(summary.expensesByCategory.size).toBe(0)
  })

  it('reports a negative cash flow when the period spent more than it earned', () => {
    const summary = summarizeCashflow([
      tx({ transactionType: 'income', amount: 100, amountInBaseCurrency: 100 }),
      tx({ _id: 't-2', amount: 250, amountInBaseCurrency: 250 }),
    ])

    expect(summary.cashFlow).toBe(-150)
  })
})
