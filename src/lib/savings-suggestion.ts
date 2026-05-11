import { differenceInCalendarDays, differenceInCalendarMonths, isBefore, startOfDay } from 'date-fns'
import type { SavingGoal } from '../../shared/schemas/saving-goal.schema'
import type { Wallet } from '../../shared/schemas/wallet.schema'
import type { Transaction } from '../../shared/schemas/transaction.schema'

export type SuggestionStatus =
  | 'no-deadline'
  | 'fully-funded'
  | 'overdue'
  | 'under-month'
  | 'on-track'

export interface SavingsSuggestion {
  status: SuggestionStatus
  remainingAmount: number
  monthsRemaining: number
  monthlyAmount: number
}

export function getSavingsSuggestion(
  goal: Pick<SavingGoal, 'targetAmount' | 'allocatedAmount' | 'targetDate'>,
  now: Date = new Date()
): SavingsSuggestion {
  const remainingAmount = Math.max(goal.targetAmount - goal.allocatedAmount, 0)

  if (remainingAmount === 0) {
    return { status: 'fully-funded', remainingAmount: 0, monthsRemaining: 0, monthlyAmount: 0 }
  }

  if (!goal.targetDate) {
    return { status: 'no-deadline', remainingAmount, monthsRemaining: 0, monthlyAmount: 0 }
  }

  const deadline = startOfDay(new Date(goal.targetDate))
  const today = startOfDay(now)

  if (isBefore(deadline, today)) {
    return { status: 'overdue', remainingAmount, monthsRemaining: 0, monthlyAmount: 0 }
  }

  const monthsRemaining = differenceInCalendarMonths(deadline, today)

  if (monthsRemaining < 1) {
    return { status: 'under-month', remainingAmount, monthsRemaining: 0, monthlyAmount: 0 }
  }

  const monthlyAmount = Math.round((remainingAmount / monthsRemaining) * 100) / 100
  return { status: 'on-track', remainingAmount, monthsRemaining, monthlyAmount }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function getPeriodSavingsSuggestion(
  goal: Pick<SavingGoal, 'targetAmount' | 'allocatedAmount' | 'targetDate' | 'achieved'>,
  periodStart: Date,
  periodEnd: Date,
  now?: Date,
): { amount: number } {
  const remainingAmount = Math.max(goal.targetAmount - goal.allocatedAmount, 0)

  if (goal.achieved || remainingAmount <= 0 || !goal.targetDate) {
    return { amount: 0 }
  }

  const deadline = startOfDay(new Date(goal.targetDate))
  const today = startOfDay(now ?? new Date())
  const pStart = startOfDay(periodStart)
  const pEnd = startOfDay(periodEnd)

  if (isBefore(deadline, today)) {
    if (isBefore(pEnd, today)) {
      return { amount: 0 }
    }
    return { amount: round2(remainingAmount) }
  }

  if (deadline.getTime() <= pEnd.getTime()) {
    return { amount: round2(remainingAmount) }
  }

  if (isBefore(pEnd, today)) {
    return { amount: 0 }
  }

  const effectiveStart = pStart.getTime() > today.getTime() ? pStart : today
  const activeDays = Math.max(0, differenceInCalendarDays(pEnd, effectiveStart) + 1)
  const totalDays = Math.max(1, differenceInCalendarDays(deadline, today))
  const amount = remainingAmount * (activeDays / totalDays)
  return { amount: round2(amount) }
}

export interface WalletSavingsSuggestion {
  wallet: Wallet
  currency: string
  amount: number
  contributingGoalCount: number
}

export function computeSavingsSuggestionsByWallet(
  wallets: Pick<Wallet, '_id' | 'name' | 'currency' | 'isSavings'>[],
  goals: Pick<SavingGoal, '_id' | 'walletId' | 'targetAmount' | 'allocatedAmount' | 'targetDate' | 'achieved' | 'sourceRecurringPaymentId'>[],
  transactions: Pick<Transaction, '_id' | 'transactionType' | 'walletId' | 'toWalletId' | 'amount' | 'currency' | 'date'>[],
  periodStart: Date,
  periodEnd: Date,
  now?: Date,
): WalletSavingsSuggestion[] {
  const savingsWallets = new Map<string, Pick<Wallet, '_id' | 'name' | 'currency' | 'isSavings'>>()
  for (const wallet of wallets) {
    if (wallet.isSavings === true) {
      savingsWallets.set(wallet._id, wallet)
    }
  }

  const accumulators = new Map<string, { sum: number; count: number }>()

  for (const goal of goals) {
    if (!savingsWallets.has(goal.walletId)) continue
    if (goal.achieved === true) continue
    if (!goal.targetDate) continue

    const remainingAmount = Math.max(goal.targetAmount - goal.allocatedAmount, 0)
    if (remainingAmount <= 0) continue

    const goalDeadline = new Date(goal.targetDate)
    if (
      goalDeadline >= periodStart &&
      goalDeadline <= periodEnd &&
      goal.sourceRecurringPaymentId
    ) {
      continue
    }

    const { amount } = getPeriodSavingsSuggestion(goal, periodStart, periodEnd, now)
    if (amount > 0) {
      const existing = accumulators.get(goal.walletId) ?? { sum: 0, count: 0 }
      existing.sum += amount
      existing.count += 1
      accumulators.set(goal.walletId, existing)
    }
  }

  const results: WalletSavingsSuggestion[] = []

  for (const [walletId, accumulator] of accumulators) {
    const wallet = savingsWallets.get(walletId)
    if (!wallet) continue

    let alreadyTransferred = 0
    for (const tx of transactions) {
      if (tx.transactionType !== 'transfer') continue
      if (tx.toWalletId !== wallet._id) continue
      if (tx.currency !== wallet.currency) continue
      const txDate = new Date(tx.date)
      if (txDate < periodStart || txDate > periodEnd) continue
      alreadyTransferred += tx.amount
    }

    const net = round2(Math.max(accumulator.sum - alreadyTransferred, 0))
    if (net > 0) {
      results.push({
        wallet: wallet as Wallet,
        currency: wallet.currency,
        amount: net,
        contributingGoalCount: accumulator.count,
      })
    }
  }

  results.sort((a, b) => a.wallet.name.localeCompare(b.wallet.name))
  return results
}
