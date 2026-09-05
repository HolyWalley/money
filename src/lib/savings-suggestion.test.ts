import { describe, it, expect } from 'vitest'
import { UTCDate } from '@date-fns/utc'
import {
  getSavingsSuggestion,
  getPeriodSavingsSuggestion,
  computeSavingsSuggestionsByWallet,
  countContributionOccurrences,
  hasAllocationRoom,
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
    expect(result.amount).toBe(0)
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
    expect(result.amount).toBe(0)
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
    expect(result.amount).toBe(0)
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
    expect(result.amount).toBe(0)
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
    expect(result.amount).toBe(800)
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
    expect(result.amount).toBe(0)
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
    expect(result.amount).toBe(900)
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
    // activeDays = full period (Mar 1 – Mar 31) = 31
    // totalDays = diffInCalDays(Jun 15, Mar 1) = 106
    // amount = 1000 * 31/106 = 292.4528... rounded to 292.45
    expect(result.amount).toBe(292.45)
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
    // activeDays = full period (May 1 – May 31) = 31
    // totalDays = diffInCalDays(Jun 15, May 1) = 45
    // amount = 1000 * 31/45 = 688.8888... rounded to 688.89
    expect(result.amount).toBe(688.89)
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
    goalType: 'target',
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
    toAmount: overrides.toAmount,
    toCurrency: overrides.toCurrency,
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

function utc(year: number, monthIndex: number, day: number, hours = 0, minutes = 0): UTCDate {
  return new UTCDate(year, monthIndex, day, hours, minutes)
}

function makeContributionGoal(
  overrides: Partial<SavingGoal> & { _id: string; walletId: string; contributionAmount: number },
): SavingGoal {
  return {
    _id: overrides._id,
    walletId: overrides.walletId,
    name: overrides.name ?? 'Travel',
    goalType: 'contribution',
    contributionAmount: overrides.contributionAmount,
    contributionPeriodType: overrides.contributionPeriodType ?? 'monthly',
    contributionMonthDay: overrides.contributionMonthDay,
    contributionWeekDay: overrides.contributionWeekDay,
    contributionYearDay: overrides.contributionYearDay,
    allocatedAmount: overrides.allocatedAmount ?? 0,
    achieved: overrides.achieved ?? false,
    order: overrides.order ?? 0,
    createdAt: overrides.createdAt ?? isoAt(2026, 0, 1),
    updatedAt: overrides.updatedAt ?? isoAt(2026, 0, 1),
  }
}

describe('countContributionOccurrences', () => {
  it('returns 0 when contributionPeriodType is missing', () => {
    expect(countContributionOccurrences({}, utc(2026, 0, 1), utc(2026, 0, 31))).toBe(0)
  })

  it('returns 0 for an inverted window', () => {
    expect(
      countContributionOccurrences(
        { contributionPeriodType: 'monthly', contributionMonthDay: 1 },
        utc(2026, 5, 10),
        utc(2026, 5, 1),
      ),
    ).toBe(0)
  })

  it('counts exactly 1 for a monthDay-1 goal in every calendar month of 2026', () => {
    for (let month = 0; month < 12; month++) {
      const start = utc(2026, month, 1)
      const end = utc(2026, month + 1, 0)
      expect(
        countContributionOccurrences(
          { contributionPeriodType: 'monthly', contributionMonthDay: 1 },
          start,
          end,
        ),
      ).toBe(1)
    }
  })

  it('counts exactly 1 for a monthDay-15 goal in every calendar month of 2026', () => {
    for (let month = 0; month < 12; month++) {
      const start = utc(2026, month, 1)
      const end = utc(2026, month + 1, 0)
      expect(
        countContributionOccurrences(
          { contributionPeriodType: 'monthly', contributionMonthDay: 15 },
          start,
          end,
        ),
      ).toBe(1)
    }
  })

  it('counts exactly 1 for a monthDay-31 goal in every calendar month of 2026 despite clamping', () => {
    for (let month = 0; month < 12; month++) {
      const start = utc(2026, month, 1)
      const end = utc(2026, month + 1, 0)
      expect(
        countContributionOccurrences(
          { contributionPeriodType: 'monthly', contributionMonthDay: 31 },
          start,
          end,
        ),
      ).toBe(1)
    }
  })

  it('counts the clamped 2024-02-29 start for a monthDay-31 goal in a leap February', () => {
    expect(
      countContributionOccurrences(
        { contributionPeriodType: 'monthly', contributionMonthDay: 31 },
        utc(2024, 1, 1),
        utc(2024, 1, 29),
      ),
    ).toBe(1)
  })

  it('counts 4 weekly starts in January 2026 for a Monday-anchored goal', () => {
    expect(
      countContributionOccurrences(
        { contributionPeriodType: 'weekly', contributionWeekDay: 1 },
        utc(2026, 0, 1),
        utc(2026, 0, 31),
      ),
    ).toBe(4)
  })

  it('counts exactly 4 weekly starts in a 28-day February', () => {
    expect(
      countContributionOccurrences(
        { contributionPeriodType: 'weekly', contributionWeekDay: 1 },
        utc(2026, 1, 1),
        utc(2026, 1, 28),
      ),
    ).toBe(4)
  })

  it('counts 5 weekly starts when the anchor lands on the first day of the month', () => {
    expect(
      countContributionOccurrences(
        { contributionPeriodType: 'weekly', contributionWeekDay: 4 },
        utc(2026, 0, 1),
        utc(2026, 0, 31),
      ),
    ).toBe(5)
  })

  it('counts a yearly goal once in its anchor month and zero elsewhere', () => {
    for (let month = 0; month < 12; month++) {
      const start = utc(2026, month, 1)
      const end = utc(2026, month + 1, 0)
      expect(
        countContributionOccurrences(
          { contributionPeriodType: 'yearly', contributionYearDay: 1 },
          start,
          end,
        ),
      ).toBe(month === 0 ? 1 : 0)
    }
  })

  it('counts a yearDay-100 yearly goal once in April 2026 and zero elsewhere', () => {
    for (let month = 0; month < 12; month++) {
      const start = utc(2026, month, 1)
      const end = utc(2026, month + 1, 0)
      expect(
        countContributionOccurrences(
          { contributionPeriodType: 'yearly', contributionYearDay: 100 },
          start,
          end,
        ),
      ).toBe(month === 3 ? 1 : 0)
    }
  })

  it('counts 12 monthly starts over a 365-day rolling window for every anchor day', () => {
    for (const contributionMonthDay of [1, 15, 31]) {
      expect(
        countContributionOccurrences(
          { contributionPeriodType: 'monthly', contributionMonthDay },
          utc(2025, 5, 16),
          utc(2026, 5, 15),
        ),
      ).toBe(12)
    }
  })

  it('counts 53 weekly starts over a 365-day rolling window anchored on its first day', () => {
    expect(
      countContributionOccurrences(
        { contributionPeriodType: 'weekly', contributionWeekDay: 1 },
        utc(2025, 5, 16),
        utc(2026, 5, 15),
      ),
    ).toBe(53)
  })

  it('counts at most one monthly start inside a 7-day window', () => {
    let sawOne = false
    let sawZero = false
    for (let day = 1; day <= 25; day++) {
      const count = countContributionOccurrences(
        { contributionPeriodType: 'monthly', contributionMonthDay: 1 },
        utc(2026, 0, day),
        utc(2026, 0, day + 6),
      )
      expect(count === 0 || count === 1).toBe(true)
      if (count === 1) sawOne = true
      if (count === 0) sawZero = true
    }
    expect(sawOne).toBe(true)
    expect(sawZero).toBe(true)
  })

  it('normalizes a window that carries a wall-clock time', () => {
    expect(
      countContributionOccurrences(
        { contributionPeriodType: 'monthly', contributionMonthDay: 15 },
        utc(2026, 0, 15, 14, 30),
        utc(2026, 0, 15, 14, 30),
      ),
    ).toBe(1)
  })

  it('treats both window bounds as inclusive on the day', () => {
    expect(
      countContributionOccurrences(
        { contributionPeriodType: 'monthly', contributionMonthDay: 15 },
        utc(2026, 0, 15),
        utc(2026, 0, 15),
      ),
    ).toBe(1)
    expect(
      countContributionOccurrences(
        { contributionPeriodType: 'monthly', contributionMonthDay: 15 },
        utc(2026, 0, 16),
        utc(2026, 0, 16),
      ),
    ).toBe(0)
  })

  it('falls back to the app default anchor day when none is stored', () => {
    expect(
      countContributionOccurrences(
        { contributionPeriodType: 'monthly' },
        utc(2026, 0, 1),
        utc(2026, 0, 31),
      ),
    ).toBe(1)
  })
})

describe('getPeriodSavingsSuggestion for contribution goals', () => {
  const goal = {
    goalType: 'contribution' as const,
    contributionAmount: 100,
    contributionPeriodType: 'monthly' as const,
    contributionMonthDay: 1,
    allocatedAmount: 0,
    achieved: false,
  }

  it('suggests exactly the configured amount for an aligned monthly window', () => {
    const result = getPeriodSavingsSuggestion(goal, utc(2026, 0, 1), utc(2026, 0, 31), utc(2026, 0, 15))
    expect(result.path).toBe('contribution')
    expect(result.amount).toBe(100)
  })

  it('suggests 0 for a window entirely in the past', () => {
    const result = getPeriodSavingsSuggestion(goal, utc(2025, 10, 1), utc(2025, 10, 30), utc(2026, 0, 15))
    expect(result.path).toBe('past-period')
    expect(result.amount).toBe(0)
  })

  it('does not treat a window ending today as past', () => {
    const result = getPeriodSavingsSuggestion(goal, utc(2026, 0, 1), utc(2026, 0, 15), utc(2026, 0, 15))
    expect(result.path).toBe('contribution')
    expect(result.amount).toBe(100)
  })

  it('suggests 0 for an achieved contribution goal', () => {
    const result = getPeriodSavingsSuggestion(
      { ...goal, achieved: true },
      utc(2026, 0, 1),
      utc(2026, 0, 31),
      utc(2026, 0, 15),
    )
    expect(result.path).toBe('achieved')
    expect(result.amount).toBe(0)
  })

  it('never reports a remaining amount for a contribution goal', () => {
    const result = getPeriodSavingsSuggestion(
      { ...goal, allocatedAmount: 4000 },
      utc(2026, 0, 1),
      utc(2026, 0, 31),
      utc(2026, 0, 15),
    )
    expect(result.remainingAmount).toBe(0)
    expect(result.amount).toBe(100)
  })

  it('suggests 0 in a month with no yearly anchor without crashing', () => {
    const yearly = {
      goalType: 'contribution' as const,
      contributionAmount: 1200,
      contributionPeriodType: 'yearly' as const,
      contributionYearDay: 1,
      allocatedAmount: 0,
      achieved: false,
    }
    expect(getPeriodSavingsSuggestion(yearly, utc(2026, 4, 1), utc(2026, 4, 31), utc(2026, 4, 15)).amount).toBe(0)
    expect(getPeriodSavingsSuggestion(yearly, utc(2026, 0, 1), utc(2026, 0, 31), utc(2026, 0, 15)).amount).toBe(1200)
  })

  it('multiplies by 4 for a weekly goal viewed over a calendar month', () => {
    const weekly = {
      goalType: 'contribution' as const,
      contributionAmount: 25,
      contributionPeriodType: 'weekly' as const,
      contributionWeekDay: 1,
      allocatedAmount: 0,
      achieved: false,
    }
    const result = getPeriodSavingsSuggestion(weekly, utc(2026, 0, 1), utc(2026, 0, 31), utc(2026, 0, 15))
    expect(result.amount).toBe(100)
  })

  it('rounds the multiplied amount to 2 decimals', () => {
    const weekly = {
      goalType: 'contribution' as const,
      contributionAmount: 33.33,
      contributionPeriodType: 'weekly' as const,
      contributionWeekDay: 1,
      allocatedAmount: 0,
      achieved: false,
    }
    const result = getPeriodSavingsSuggestion(weekly, utc(2026, 0, 1), utc(2026, 0, 31), utc(2026, 0, 15))
    expect(result.amount).toBe(133.32)
  })

  it('does not crash on a half-written contribution goal with no cadence', () => {
    const result = getPeriodSavingsSuggestion(
      { goalType: 'contribution', contributionAmount: 100, allocatedAmount: 0, achieved: false },
      utc(2026, 0, 1),
      utc(2026, 0, 31),
      utc(2026, 0, 15),
    )
    expect(result.amount).toBe(0)
    expect(result.path).toBe('contribution')
  })
})

describe('getSavingsSuggestion for contribution goals', () => {
  it('reports the per-period amount instead of target arithmetic', () => {
    const result = getSavingsSuggestion(
      {
        goalType: 'contribution',
        contributionAmount: 100,
        contributionPeriodType: 'monthly',
        allocatedAmount: 4200,
      },
      utc(2026, 0, 15),
    )
    expect(result).toEqual({
      status: 'contribution',
      remainingAmount: 0,
      monthsRemaining: 0,
      monthlyAmount: 100,
    })
  })
})

describe('computeSavingsSuggestionsByWallet with contribution goals', () => {
  const wallets: Wallet[] = [makeWallet({ _id: 'w-sav', name: 'Savings', currency: 'EUR' })]
  const goals: SavingGoal[] = [
    makeContributionGoal({
      _id: 'g-travel',
      walletId: 'w-sav',
      name: 'Travel',
      contributionAmount: 100,
      contributionPeriodType: 'monthly',
      contributionMonthDay: 1,
    }),
  ]

  function transferOf(amount: number, date: string): Transaction {
    return makeTransferTx({ _id: 't1', toWalletId: 'w-sav', amount, currency: 'EUR', date })
  }

  it('suggests exactly the configured amount before any transfer', () => {
    const result = computeSavingsSuggestionsByWallet(
      wallets, goals, [], utc(2026, 0, 1), utc(2026, 0, 31), utc(2026, 0, 15),
    )
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(100)
    expect(result[0].contributingGoalCount).toBe(1)
  })

  it('breaks the suggestion down per goal', () => {
    const mixed: SavingGoal[] = [
      makeGoal({
        _id: 'g-laptop', walletId: 'w-sav', name: 'Laptop',
        targetAmount: 500, targetDate: isoAt(2026, 0, 20),
      }),
      ...goals,
    ]
    const result = computeSavingsSuggestionsByWallet(
      wallets, mixed, [], utc(2026, 0, 1), utc(2026, 0, 31), utc(2026, 0, 15),
    )
    expect(result[0].goals).toEqual([
      { goalId: 'g-laptop', name: 'Laptop', amount: 500 },
      { goalId: 'g-travel', name: 'Travel', amount: 100 },
    ])
  })

  it('reports an empty breakdown for no contributing goals', () => {
    const result = computeSavingsSuggestionsByWallet(
      wallets, [], [], utc(2026, 0, 1), utc(2026, 0, 31), utc(2026, 0, 15),
    )
    expect(result).toEqual([])
  })

  it('goes quiet once the full transfer is logged inside the period', () => {
    const result = computeSavingsSuggestionsByWallet(
      wallets, goals, [transferOf(100, isoAt(2026, 0, 10))], utc(2026, 0, 1), utc(2026, 0, 31), utc(2026, 0, 15),
    )
    expect(result).toEqual([])
  })

  it('asks for the shortfall after a partial transfer', () => {
    const result = computeSavingsSuggestionsByWallet(
      wallets, goals, [transferOf(40, isoAt(2026, 0, 10))], utc(2026, 0, 1), utc(2026, 0, 31), utc(2026, 0, 15),
    )
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(60)
  })

  it('asks again in the next period, with last period transfer outside the window', () => {
    const result = computeSavingsSuggestionsByWallet(
      wallets, goals, [transferOf(100, isoAt(2026, 0, 10))], utc(2026, 1, 1), utc(2026, 1, 28), utc(2026, 1, 15),
    )
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(100)
  })

  it('stays silent for a window entirely in the past', () => {
    const result = computeSavingsSuggestionsByWallet(
      wallets, goals, [], utc(2025, 10, 1), utc(2025, 10, 30), utc(2026, 0, 15),
    )
    expect(result).toEqual([])
  })

  it('stays silent for an achieved contribution goal', () => {
    const achieved = [makeContributionGoal({
      _id: 'g-travel', walletId: 'w-sav', contributionAmount: 100,
      contributionPeriodType: 'monthly', contributionMonthDay: 1, achieved: true,
    })]
    const result = computeSavingsSuggestionsByWallet(
      wallets, achieved, [], utc(2026, 0, 1), utc(2026, 0, 31), utc(2026, 0, 15),
    )
    expect(result).toEqual([])
  })

  it('ignores a contribution goal on a non-savings wallet', () => {
    const checking: Wallet[] = [makeWallet({ _id: 'w-sav', name: 'Checking', currency: 'EUR', isSavings: false })]
    const result = computeSavingsSuggestionsByWallet(
      checking, goals, [], utc(2026, 0, 1), utc(2026, 0, 31), utc(2026, 0, 15),
    )
    expect(result).toEqual([])
  })

  it('never dedups a contribution goal that carries a sourceRecurringPaymentId', () => {
    const linked = [makeContributionGoal({
      _id: 'g-travel', walletId: 'w-sav', contributionAmount: 100,
      contributionPeriodType: 'monthly', contributionMonthDay: 1,
      sourceRecurringPaymentId: 'rec-1',
    })]
    const result = computeSavingsSuggestionsByWallet(
      wallets, linked, [], utc(2026, 0, 1), utc(2026, 0, 31), utc(2026, 0, 15),
    )
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(100)
  })

  it('sums a target goal and a contribution goal on the same wallet', () => {
    const mixed: SavingGoal[] = [
      makeGoal({
        _id: 'g-laptop', walletId: 'w-sav', name: 'Laptop',
        targetAmount: 500, targetDate: isoAt(2026, 0, 20),
      }),
      ...goals,
    ]
    const result = computeSavingsSuggestionsByWallet(
      wallets, mixed, [], utc(2026, 0, 1), utc(2026, 0, 31), utc(2026, 0, 15),
    )
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(600)
    expect(result[0].contributingGoalCount).toBe(2)
  })

  it('keeps a fully-allocated contribution goal suggesting, unlike a target goal', () => {
    const overAllocated = [makeContributionGoal({
      _id: 'g-travel', walletId: 'w-sav', contributionAmount: 100,
      contributionPeriodType: 'monthly', contributionMonthDay: 1, allocatedAmount: 12000,
    })]
    const result = computeSavingsSuggestionsByWallet(
      wallets, overAllocated, [], utc(2026, 0, 1), utc(2026, 0, 31), utc(2026, 0, 15),
    )
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(100)
  })

  it('goes quiet after a transfer funded from a wallet in another currency', () => {
    const crossCurrency = makeTransferTx({
      _id: 't-pln', toWalletId: 'w-sav', walletId: 'w-checking',
      amount: 430, currency: 'PLN', toAmount: 100, toCurrency: 'EUR',
      date: isoAt(2026, 0, 10),
    })
    const result = computeSavingsSuggestionsByWallet(
      wallets, goals, [crossCurrency], utc(2026, 0, 1), utc(2026, 0, 31), utc(2026, 0, 15),
    )
    expect(result).toEqual([])
  })

  it('nets the shortfall from the received amount, not the source amount', () => {
    const crossCurrency = makeTransferTx({
      _id: 't-pln', toWalletId: 'w-sav', walletId: 'w-checking',
      amount: 258, currency: 'PLN', toAmount: 60, toCurrency: 'EUR',
      date: isoAt(2026, 0, 10),
    })
    const result = computeSavingsSuggestionsByWallet(
      wallets, goals, [crossCurrency], utc(2026, 0, 1), utc(2026, 0, 31), utc(2026, 0, 15),
    )
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(40)
  })

  it('ignores a transfer that lands in a currency other than the wallet currency', () => {
    const wrongCurrency = makeTransferTx({
      _id: 't-usd', toWalletId: 'w-sav', walletId: 'w-checking',
      amount: 100, currency: 'USD', toAmount: 100, toCurrency: 'USD',
      date: isoAt(2026, 0, 10),
    })
    const result = computeSavingsSuggestionsByWallet(
      wallets, goals, [wrongCurrency], utc(2026, 0, 1), utc(2026, 0, 31), utc(2026, 0, 15),
    )
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(100)
  })
})

describe('legacy goals with no goalType field', () => {
  const legacyGoal = {
    _id: 'g-legacy',
    walletId: 'w-sav',
    name: 'Legacy goal',
    targetAmount: 1000,
    allocatedAmount: 200,
    achieved: false,
    order: 0,
    targetDate: isoAt(2026, 0, 20),
    createdAt: isoAt(2025, 0, 1),
    updatedAt: isoAt(2025, 0, 1),
  }

  it('getSavingsSuggestion still uses target arithmetic', () => {
    const result = getSavingsSuggestion(legacyGoal, utc(2026, 0, 15))
    expect(result.status).toBe('under-month')
    expect(result.remainingAmount).toBe(800)
  })

  it('getPeriodSavingsSuggestion still uses the target paths', () => {
    const result = getPeriodSavingsSuggestion(legacyGoal, utc(2026, 0, 1), utc(2026, 0, 31), utc(2026, 0, 15))
    expect(result.path).toBe('in-period-pays-full')
    expect(result.amount).toBe(800)
    expect(result.remainingAmount).toBe(800)
  })

  it('computeSavingsSuggestionsByWallet still includes it as a target goal', () => {
    const wallets: Wallet[] = [makeWallet({ _id: 'w-sav', name: 'Savings' })]
    const result = computeSavingsSuggestionsByWallet(
      wallets, [legacyGoal], [], utc(2026, 0, 1), utc(2026, 0, 31), utc(2026, 0, 15),
    )
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(800)
    expect(result[0].contributingGoalCount).toBe(1)
  })

  it('computeSavingsSuggestionsByWallet still applies the recurring-payment dedup to it', () => {
    const wallets: Wallet[] = [makeWallet({ _id: 'w-sav', name: 'Savings' })]
    const result = computeSavingsSuggestionsByWallet(
      wallets,
      [{ ...legacyGoal, sourceRecurringPaymentId: 'rec-1' }],
      [], utc(2026, 0, 1), utc(2026, 0, 31), utc(2026, 0, 15),
    )
    expect(result).toEqual([])
  })
})

describe('hasAllocationRoom', () => {
  it('reports room while a target goal is under its target', () => {
    expect(hasAllocationRoom({ goalType: 'target', targetAmount: 1000, allocatedAmount: 400 })).toBe(true)
  })

  it('reports no room once a target goal reaches its target', () => {
    expect(hasAllocationRoom({ goalType: 'target', targetAmount: 1000, allocatedAmount: 1000 })).toBe(false)
  })

  it('reports no room once a target goal exceeds its target', () => {
    expect(hasAllocationRoom({ goalType: 'target', targetAmount: 1000, allocatedAmount: 1200 })).toBe(false)
  })

  it('treats a legacy goal with no goalType as a target goal', () => {
    expect(hasAllocationRoom({ targetAmount: 1000, allocatedAmount: 400 })).toBe(true)
    expect(hasAllocationRoom({ targetAmount: 1000, allocatedAmount: 1000 })).toBe(false)
  })

  it('always reports room for a contribution goal, however much is saved', () => {
    expect(hasAllocationRoom({ goalType: 'contribution', contributionAmount: 100, allocatedAmount: 0 })).toBe(true)
    expect(hasAllocationRoom({ goalType: 'contribution', contributionAmount: 100, allocatedAmount: 99999 })).toBe(true)
  })

  it('reports no room for a target goal with no targetAmount', () => {
    expect(hasAllocationRoom({ goalType: 'target', allocatedAmount: 0 })).toBe(false)
  })
})
