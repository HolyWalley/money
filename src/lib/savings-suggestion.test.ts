import { describe, it, expect } from 'vitest'
import { UTCDate } from '@date-fns/utc'
import {
  getSavingsSuggestion,
  getPeriodSavingsSuggestion,
  computeSavingsSuggestionsByWallet,
} from './savings-suggestion'
import type { Wallet } from '../../shared/schemas/wallet.schema'
import type { SavingGoal } from '../../shared/schemas/saving-goal.schema'
import type { Transaction } from '../../shared/schemas/transaction.schema'

function at(year: number, monthIndex: number, day: number): Date {
  return new Date(new UTCDate(year, monthIndex, day).toISOString())
}

function isoAt(year: number, monthIndex: number, day: number): string {
  return new UTCDate(year, monthIndex, day).toISOString()
}

describe('getSavingsSuggestion', () => {
  it('returns no-deadline when targetDate is missing', () => {
    const now = at(2026, 4, 9)
    const result = getSavingsSuggestion({ targetAmount: 1000, allocatedAmount: 0 }, now)
    expect(result).toEqual({
      status: 'no-deadline',
      remainingAmount: 1000,
      monthsRemaining: 0,
      monthlyAmount: 0,
    })
  })

  it('returns fully-funded when allocatedAmount equals targetAmount', () => {
    const now = at(2026, 4, 9)
    const result = getSavingsSuggestion(
      { targetAmount: 1000, allocatedAmount: 1000, targetDate: isoAt(2026, 8, 9) },
      now
    )
    expect(result).toEqual({
      status: 'fully-funded',
      remainingAmount: 0,
      monthsRemaining: 0,
      monthlyAmount: 0,
    })
  })

  it('returns fully-funded when allocatedAmount exceeds targetAmount', () => {
    const now = at(2026, 4, 9)
    const result = getSavingsSuggestion(
      { targetAmount: 1000, allocatedAmount: 1500, targetDate: isoAt(2026, 8, 9) },
      now
    )
    expect(result).toEqual({
      status: 'fully-funded',
      remainingAmount: 0,
      monthsRemaining: 0,
      monthlyAmount: 0,
    })
  })

  it('returns overdue when the deadline is yesterday and goal is under-funded', () => {
    const now = at(2026, 4, 9)
    const result = getSavingsSuggestion(
      { targetAmount: 1000, allocatedAmount: 200, targetDate: isoAt(2026, 4, 8) },
      now
    )
    expect(result).toEqual({
      status: 'overdue',
      remainingAmount: 800,
      monthsRemaining: 0,
      monthlyAmount: 0,
    })
  })

  it('returns under-month when deadline is 5 days from now', () => {
    const now = at(2026, 4, 9)
    const result = getSavingsSuggestion(
      { targetAmount: 1000, allocatedAmount: 0, targetDate: isoAt(2026, 4, 14) },
      now
    )
    expect(result).toEqual({
      status: 'under-month',
      remainingAmount: 1000,
      monthsRemaining: 0,
      monthlyAmount: 0,
    })
  })

  it('returns on-track with monthlyAmount 300 for $1200 over 4 calendar months', () => {
    const now = at(2026, 4, 9)
    const result = getSavingsSuggestion(
      { targetAmount: 1200, allocatedAmount: 0, targetDate: isoAt(2026, 8, 9) },
      now
    )
    expect(result).toEqual({
      status: 'on-track',
      remainingAmount: 1200,
      monthsRemaining: 4,
      monthlyAmount: 300,
    })
  })

  it('returns under-month when deadline is today', () => {
    const now = at(2026, 4, 9)
    const result = getSavingsSuggestion(
      { targetAmount: 1000, allocatedAmount: 0, targetDate: isoAt(2026, 4, 9) },
      now
    )
    expect(result).toEqual({
      status: 'under-month',
      remainingAmount: 1000,
      monthsRemaining: 0,
      monthlyAmount: 0,
    })
  })

  it('rounds monthlyAmount to 2 decimals: $1000 over 3 months → 333.33', () => {
    const now = at(2026, 4, 9)
    const result = getSavingsSuggestion(
      { targetAmount: 1000, allocatedAmount: 0, targetDate: isoAt(2026, 7, 9) },
      now
    )
    expect(result).toEqual({
      status: 'on-track',
      remainingAmount: 1000,
      monthsRemaining: 3,
      monthlyAmount: 333.33,
    })
  })

  it('computes monthlyAmount 400 for partially-funded goal with 2 months left', () => {
    const now = at(2026, 4, 9)
    const result = getSavingsSuggestion(
      { targetAmount: 1000, allocatedAmount: 200, targetDate: isoAt(2026, 6, 9) },
      now
    )
    expect(result).toEqual({
      status: 'on-track',
      remainingAmount: 800,
      monthsRemaining: 2,
      monthlyAmount: 400,
    })
  })
})

describe('getPeriodSavingsSuggestion', () => {
  it('returns 0 when targetDate is missing', () => {
    const now = at(2026, 2, 15)
    const periodStart = at(2026, 2, 1)
    const periodEnd = at(2026, 2, 31)
    const result = getPeriodSavingsSuggestion(
      { targetAmount: 1000, allocatedAmount: 0, achieved: false },
      periodStart,
      periodEnd,
      now,
    )
    expect(result).toEqual({ amount: 0 })
  })

  it('returns 0 when goal is achieved', () => {
    const now = at(2026, 2, 15)
    const periodStart = at(2026, 2, 1)
    const periodEnd = at(2026, 2, 31)
    const result = getPeriodSavingsSuggestion(
      { targetAmount: 1000, allocatedAmount: 0, achieved: true, targetDate: isoAt(2026, 5, 15) },
      periodStart,
      periodEnd,
      now,
    )
    expect(result).toEqual({ amount: 0 })
  })

  it('returns 0 when remainingAmount is 0', () => {
    const now = at(2026, 2, 15)
    const periodStart = at(2026, 2, 1)
    const periodEnd = at(2026, 2, 31)
    const result = getPeriodSavingsSuggestion(
      { targetAmount: 1000, allocatedAmount: 1000, achieved: false, targetDate: isoAt(2026, 5, 15) },
      periodStart,
      periodEnd,
      now,
    )
    expect(result).toEqual({ amount: 0 })
  })

  it('returns 0 when the period is entirely before today', () => {
    const now = at(2026, 2, 15)
    const periodStart = at(2026, 1, 1)
    const periodEnd = at(2026, 1, 28)
    const result = getPeriodSavingsSuggestion(
      { targetAmount: 1000, allocatedAmount: 0, achieved: false, targetDate: isoAt(2026, 5, 15) },
      periodStart,
      periodEnd,
      now,
    )
    expect(result).toEqual({ amount: 0 })
  })

  it('returns full remainingAmount for overdue goal when period covers today', () => {
    const now = at(2026, 2, 15)
    const periodStart = at(2026, 2, 1)
    const periodEnd = at(2026, 2, 31)
    const result = getPeriodSavingsSuggestion(
      { targetAmount: 1000, allocatedAmount: 200, achieved: false, targetDate: isoAt(2026, 2, 14) },
      periodStart,
      periodEnd,
      now,
    )
    expect(result).toEqual({ amount: 800 })
  })

  it('returns 0 for overdue goal when period is entirely in the past', () => {
    const now = at(2026, 2, 15)
    const periodStart = at(2026, 1, 1)
    const periodEnd = at(2026, 1, 28)
    const result = getPeriodSavingsSuggestion(
      { targetAmount: 1000, allocatedAmount: 200, achieved: false, targetDate: isoAt(2026, 1, 10) },
      periodStart,
      periodEnd,
      now,
    )
    expect(result).toEqual({ amount: 0 })
  })

  it('returns full remainingAmount when deadline falls within the period and is >= today', () => {
    const now = at(2026, 2, 15)
    const periodStart = at(2026, 2, 1)
    const periodEnd = at(2026, 2, 31)
    const result = getPeriodSavingsSuggestion(
      { targetAmount: 1000, allocatedAmount: 100, achieved: false, targetDate: isoAt(2026, 2, 20) },
      periodStart,
      periodEnd,
      now,
    )
    expect(result).toEqual({ amount: 900 })
  })

  it('returns pro-rata amount when deadline is 3 months out and period is the current month', () => {
    const now = at(2026, 2, 15)
    const periodStart = at(2026, 2, 1)
    const periodEnd = at(2026, 2, 31)
    const result = getPeriodSavingsSuggestion(
      { targetAmount: 1000, allocatedAmount: 0, achieved: false, targetDate: isoAt(2026, 5, 15) },
      periodStart,
      periodEnd,
      now,
    )
    // effectiveStart = today Mar 15, activeDays = (Mar31 - Mar15) + 1 = 17
    // totalDays = diffInCalDays(Jun 15, Mar 15) = 92
    // amount = 1000 * 17/92 = 184.7826... rounded to 184.78
    expect(result).toEqual({ amount: 184.78 })
  })

  it('returns pro-rata amount for fully future period before deadline', () => {
    const now = at(2026, 2, 15)
    const periodStart = at(2026, 4, 1)
    const periodEnd = at(2026, 4, 31)
    const result = getPeriodSavingsSuggestion(
      { targetAmount: 1000, allocatedAmount: 0, achieved: false, targetDate: isoAt(2026, 5, 15) },
      periodStart,
      periodEnd,
      now,
    )
    // effectiveStart = pStart May 1, activeDays = (May31 - May1) + 1 = 31
    // totalDays = 92
    // amount = 1000 * 31/92 = 336.9565... rounded to 336.96
    expect(result).toEqual({ amount: 336.96 })
  })
})

function makeWallet(overrides: Partial<Wallet> & { _id: string; name: string }): Wallet {
  return {
    _id: overrides._id,
    type: 'wallet',
    name: overrides.name,
    currency: overrides.currency ?? 'USD',
    initialBalance: overrides.initialBalance ?? 0,
    isSavings: overrides.isSavings ?? true,
    order: overrides.order ?? 0,
    createdAt: overrides.createdAt ?? isoAt(2026, 0, 1),
    updatedAt: overrides.updatedAt ?? isoAt(2026, 0, 1),
  }
}

function makeGoal(overrides: Partial<SavingGoal> & { _id: string; walletId: string }): SavingGoal {
  return {
    _id: overrides._id,
    walletId: overrides.walletId,
    name: overrides.name ?? 'Goal',
    targetAmount: overrides.targetAmount ?? 1000,
    allocatedAmount: overrides.allocatedAmount ?? 0,
    achieved: overrides.achieved ?? false,
    order: overrides.order ?? 0,
    targetDate: overrides.targetDate,
    sourceRecurringPaymentId: overrides.sourceRecurringPaymentId,
    createdAt: overrides.createdAt ?? isoAt(2026, 0, 1),
    updatedAt: overrides.updatedAt ?? isoAt(2026, 0, 1),
  }
}

function makeTransferTx(overrides: Partial<Transaction> & { _id: string; toWalletId: string; amount: number; date: string }): Transaction {
  return {
    _id: overrides._id,
    type: 'transaction',
    transactionType: 'transfer',
    amount: overrides.amount,
    currency: overrides.currency ?? 'USD',
    categoryId: overrides.categoryId ?? '',
    walletId: overrides.walletId ?? 'other-wallet',
    toWalletId: overrides.toWalletId,
    date: overrides.date,
    createdAt: overrides.createdAt ?? overrides.date,
    updatedAt: overrides.updatedAt ?? overrides.date,
  }
}

describe('computeSavingsSuggestionsByWallet', () => {
  it('excludes non-savings wallets', () => {
    const now = at(2026, 2, 15)
    const periodStart = at(2026, 2, 1)
    const periodEnd = at(2026, 2, 31)
    const wallets: Wallet[] = [
      makeWallet({ _id: 'w-non', name: 'Checking', isSavings: false }),
    ]
    const goals: SavingGoal[] = [
      makeGoal({ _id: 'g1', walletId: 'w-non', targetAmount: 500, targetDate: isoAt(2026, 2, 20) }),
    ]
    const result = computeSavingsSuggestionsByWallet(wallets, goals, [], periodStart, periodEnd, now)
    expect(result).toEqual([])
  })

  it('excludes goal with in-period deadline AND sourceRecurringPaymentId set', () => {
    const now = at(2026, 2, 15)
    const periodStart = at(2026, 2, 1)
    const periodEnd = at(2026, 2, 31)
    const wallets: Wallet[] = [
      makeWallet({ _id: 'w-sav', name: 'Savings' }),
    ]
    const goals: SavingGoal[] = [
      makeGoal({
        _id: 'g1',
        walletId: 'w-sav',
        targetAmount: 500,
        targetDate: isoAt(2026, 2, 20),
        sourceRecurringPaymentId: 'rec-1',
      }),
    ]
    const result = computeSavingsSuggestionsByWallet(wallets, goals, [], periodStart, periodEnd, now)
    expect(result).toEqual([])
  })

  it('includes goal with in-period deadline when sourceRecurringPaymentId is undefined', () => {
    const now = at(2026, 2, 15)
    const periodStart = at(2026, 2, 1)
    const periodEnd = at(2026, 2, 31)
    const wallets: Wallet[] = [
      makeWallet({ _id: 'w-sav', name: 'Savings' }),
    ]
    const goals: SavingGoal[] = [
      makeGoal({ _id: 'g1', walletId: 'w-sav', targetAmount: 500, targetDate: isoAt(2026, 2, 20) }),
    ]
    const result = computeSavingsSuggestionsByWallet(wallets, goals, [], periodStart, periodEnd, now)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      currency: 'USD',
      amount: 500,
      contributingGoalCount: 1,
    })
    expect(result[0].wallet._id).toBe('w-sav')
  })

  it('sums two qualifying goals on the same wallet', () => {
    const now = at(2026, 2, 15)
    const periodStart = at(2026, 2, 1)
    const periodEnd = at(2026, 2, 31)
    const wallets: Wallet[] = [
      makeWallet({ _id: 'w-sav', name: 'Savings' }),
    ]
    const goals: SavingGoal[] = [
      makeGoal({ _id: 'g1', walletId: 'w-sav', targetAmount: 500, targetDate: isoAt(2026, 2, 20) }),
      makeGoal({ _id: 'g2', walletId: 'w-sav', targetAmount: 300, targetDate: isoAt(2026, 2, 25) }),
    ]
    const result = computeSavingsSuggestionsByWallet(wallets, goals, [], periodStart, periodEnd, now)
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(800)
    expect(result[0].contributingGoalCount).toBe(2)
  })

  it('reduces amount by transfer-in transactions during the period', () => {
    const now = at(2026, 2, 15)
    const periodStart = at(2026, 2, 1)
    const periodEnd = at(2026, 2, 31)
    const wallets: Wallet[] = [
      makeWallet({ _id: 'w-sav', name: 'Savings' }),
    ]
    const goals: SavingGoal[] = [
      makeGoal({ _id: 'g1', walletId: 'w-sav', targetAmount: 500, targetDate: isoAt(2026, 2, 20) }),
    ]
    const transactions: Transaction[] = [
      makeTransferTx({ _id: 't1', toWalletId: 'w-sav', amount: 200, date: isoAt(2026, 2, 10) }),
    ]
    const result = computeSavingsSuggestionsByWallet(wallets, goals, transactions, periodStart, periodEnd, now)
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(300)
  })

  it('omits wallet when transfers fully cover the suggested amount', () => {
    const now = at(2026, 2, 15)
    const periodStart = at(2026, 2, 1)
    const periodEnd = at(2026, 2, 31)
    const wallets: Wallet[] = [
      makeWallet({ _id: 'w-sav', name: 'Savings' }),
    ]
    const goals: SavingGoal[] = [
      makeGoal({ _id: 'g1', walletId: 'w-sav', targetAmount: 500, targetDate: isoAt(2026, 2, 20) }),
    ]
    const transactions: Transaction[] = [
      makeTransferTx({ _id: 't1', toWalletId: 'w-sav', amount: 500, date: isoAt(2026, 2, 10) }),
    ]
    const result = computeSavingsSuggestionsByWallet(wallets, goals, transactions, periodStart, periodEnd, now)
    expect(result).toEqual([])
  })

  it('ignores transfer-in transactions in a different currency', () => {
    const now = at(2026, 2, 15)
    const periodStart = at(2026, 2, 1)
    const periodEnd = at(2026, 2, 31)
    const wallets: Wallet[] = [
      makeWallet({ _id: 'w-sav', name: 'Savings', currency: 'USD' }),
    ]
    const goals: SavingGoal[] = [
      makeGoal({ _id: 'g1', walletId: 'w-sav', targetAmount: 500, targetDate: isoAt(2026, 2, 20) }),
    ]
    const transactions: Transaction[] = [
      makeTransferTx({ _id: 't1', toWalletId: 'w-sav', amount: 200, currency: 'EUR', date: isoAt(2026, 2, 10) }),
    ]
    const result = computeSavingsSuggestionsByWallet(wallets, goals, transactions, periodStart, periodEnd, now)
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(500)
  })

  it('ignores transfer-in transactions outside the period', () => {
    const now = at(2026, 2, 15)
    const periodStart = at(2026, 2, 1)
    const periodEnd = at(2026, 2, 31)
    const wallets: Wallet[] = [
      makeWallet({ _id: 'w-sav', name: 'Savings' }),
    ]
    const goals: SavingGoal[] = [
      makeGoal({ _id: 'g1', walletId: 'w-sav', targetAmount: 500, targetDate: isoAt(2026, 2, 20) }),
    ]
    const transactions: Transaction[] = [
      makeTransferTx({ _id: 't1', toWalletId: 'w-sav', amount: 200, date: isoAt(2026, 1, 20) }),
      makeTransferTx({ _id: 't2', toWalletId: 'w-sav', amount: 200, date: isoAt(2026, 3, 5) }),
    ]
    const result = computeSavingsSuggestionsByWallet(wallets, goals, transactions, periodStart, periodEnd, now)
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(500)
  })

  it('ignores non-transfer transactions to the savings wallet', () => {
    const now = at(2026, 2, 15)
    const periodStart = at(2026, 2, 1)
    const periodEnd = at(2026, 2, 31)
    const wallets: Wallet[] = [
      makeWallet({ _id: 'w-sav', name: 'Savings' }),
    ]
    const goals: SavingGoal[] = [
      makeGoal({ _id: 'g1', walletId: 'w-sav', targetAmount: 500, targetDate: isoAt(2026, 2, 20) }),
    ]
    const transactions: Transaction[] = [
      {
        _id: 't1',
        type: 'transaction',
        transactionType: 'income',
        amount: 200,
        currency: 'USD',
        categoryId: 'c1',
        walletId: 'w-sav',
        date: isoAt(2026, 2, 10),
        createdAt: isoAt(2026, 2, 10),
        updatedAt: isoAt(2026, 2, 10),
      },
    ]
    const result = computeSavingsSuggestionsByWallet(wallets, goals, transactions, periodStart, periodEnd, now)
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(500)
  })

  it('sorts results by wallet name ascending', () => {
    const now = at(2026, 2, 15)
    const periodStart = at(2026, 2, 1)
    const periodEnd = at(2026, 2, 31)
    const wallets: Wallet[] = [
      makeWallet({ _id: 'w-z', name: 'Zeta Savings' }),
      makeWallet({ _id: 'w-a', name: 'Alpha Savings' }),
      makeWallet({ _id: 'w-m', name: 'Mid Savings' }),
    ]
    const goals: SavingGoal[] = [
      makeGoal({ _id: 'g1', walletId: 'w-z', targetAmount: 100, targetDate: isoAt(2026, 2, 20) }),
      makeGoal({ _id: 'g2', walletId: 'w-a', targetAmount: 200, targetDate: isoAt(2026, 2, 20) }),
      makeGoal({ _id: 'g3', walletId: 'w-m', targetAmount: 300, targetDate: isoAt(2026, 2, 20) }),
    ]
    const result = computeSavingsSuggestionsByWallet(wallets, goals, [], periodStart, periodEnd, now)
    expect(result.map(r => r.wallet.name)).toEqual(['Alpha Savings', 'Mid Savings', 'Zeta Savings'])
  })
})
