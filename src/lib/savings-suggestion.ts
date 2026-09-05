import { addDays, differenceInCalendarDays, differenceInCalendarMonths, endOfDay, isBefore, startOfDay } from 'date-fns'
import { getAdjacentPeriod, getPeriodContainingDate, type Period, type PeriodSettings } from './period-utils'
import type { SavingGoal } from '../../shared/schemas/saving-goal.schema'
import type { Wallet } from '../../shared/schemas/wallet.schema'
import type { Transaction } from '../../shared/schemas/transaction.schema'

type ContributionShape = Partial<
  Pick<
    SavingGoal,
    | 'goalType'
    | 'contributionAmount'
    | 'contributionPeriodType'
    | 'contributionMonthDay'
    | 'contributionWeekDay'
    | 'contributionYearDay'
  >
>

const MAX_PERIOD_STEPS = 1000

function contributionPeriodSettings(goal: ContributionShape): PeriodSettings {
  return {
    type: goal.contributionPeriodType as PeriodSettings['type'],
    monthDay: goal.contributionMonthDay,
    weekDay: goal.contributionWeekDay,
    yearDay: goal.contributionYearDay,
  }
}

function nextPeriodAfter(period: Period, settings: PeriodSettings): Period {
  const next = getAdjacentPeriod(period, 1, settings)
  if (next.end.getTime() <= period.end.getTime()) {
    return getPeriodContainingDate(startOfDay(addDays(period.end, 1)), settings)
  }
  return next
}

export function countContributionOccurrences(
  goal: ContributionShape,
  windowStart: Date,
  windowEnd: Date,
): number {
  if (!goal.contributionPeriodType) return 0

  const settings = contributionPeriodSettings(goal)
  const wStart = startOfDay(windowStart)
  const wEnd = endOfDay(windowEnd)

  if (wEnd.getTime() < wStart.getTime()) return 0

  let count = 0
  let period = getPeriodContainingDate(wStart, settings)

  for (let i = 0; i < MAX_PERIOD_STEPS; i++) {
    if (period.start.getTime() > wEnd.getTime()) break
    if (period.start.getTime() >= wStart.getTime()) count++

    const next = nextPeriodAfter(period, settings)
    if (next.end.getTime() <= period.end.getTime()) break
    period = next
  }

  return count
}

export function hasAllocationRoom(
  goal: Pick<SavingGoal, 'targetAmount' | 'allocatedAmount'> & ContributionShape,
): boolean {
  if (goal.goalType === 'contribution') return true
  return goal.allocatedAmount < (goal.targetAmount ?? 0)
}

export type SuggestionStatus =
  | 'no-deadline'
  | 'fully-funded'
  | 'overdue'
  | 'under-month'
  | 'on-track'
  | 'contribution'

export interface SavingsSuggestion {
  status: SuggestionStatus
  remainingAmount: number
  monthsRemaining: number
  monthlyAmount: number
}

export function getSavingsSuggestion(
  goal: Pick<SavingGoal, 'targetAmount' | 'allocatedAmount' | 'targetDate'> & ContributionShape,
  now: Date = new Date()
): SavingsSuggestion {
  if (goal.goalType === 'contribution') {
    return {
      status: 'contribution',
      remainingAmount: 0,
      monthsRemaining: 0,
      monthlyAmount: round2(goal.contributionAmount ?? 0),
    }
  }

  const remainingAmount = Math.max((goal.targetAmount ?? 0) - goal.allocatedAmount, 0)

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

export interface PeriodSuggestionDetails {
  amount: number
  remainingAmount: number
  path: 'achieved' | 'no-target' | 'no-remaining' | 'past-period' | 'overdue-pays-full' | 'in-period-pays-full' | 'pro-rata' | 'contribution'
  activeDays?: number
  totalDays?: number
  deadline?: Date
  today?: Date
}

export function getPeriodSavingsSuggestion(
  goal: Pick<SavingGoal, 'targetAmount' | 'allocatedAmount' | 'targetDate' | 'achieved'> & ContributionShape,
  periodStart: Date,
  periodEnd: Date,
  now?: Date,
): PeriodSuggestionDetails {
  if (goal.goalType === 'contribution') {
    if (goal.achieved) {
      return { amount: 0, remainingAmount: 0, path: 'achieved' }
    }

    const contributionToday = startOfDay(now ?? new Date())
    if (isBefore(startOfDay(periodEnd), contributionToday)) {
      return { amount: 0, remainingAmount: 0, path: 'past-period', today: contributionToday }
    }

    const occurrences = countContributionOccurrences(goal, periodStart, periodEnd)
    return {
      amount: round2(occurrences * (goal.contributionAmount ?? 0)),
      remainingAmount: 0,
      path: 'contribution',
      today: contributionToday,
    }
  }

  const remainingAmount = Math.max((goal.targetAmount ?? 0) - goal.allocatedAmount, 0)

  if (goal.achieved) {
    return { amount: 0, remainingAmount, path: 'achieved' }
  }
  if (remainingAmount <= 0) {
    return { amount: 0, remainingAmount, path: 'no-remaining' }
  }
  if (!goal.targetDate) {
    return { amount: 0, remainingAmount, path: 'no-target' }
  }

  const deadline = startOfDay(new Date(goal.targetDate))
  const today = startOfDay(now ?? new Date())
  const pStart = startOfDay(periodStart)
  const pEnd = startOfDay(periodEnd)

  if (isBefore(deadline, today)) {
    if (isBefore(pEnd, today)) {
      return { amount: 0, remainingAmount, path: 'past-period', deadline, today }
    }
    return { amount: round2(remainingAmount), remainingAmount, path: 'overdue-pays-full', deadline, today }
  }

  if (deadline.getTime() <= pEnd.getTime()) {
    return { amount: round2(remainingAmount), remainingAmount, path: 'in-period-pays-full', deadline, today }
  }

  if (isBefore(pEnd, today)) {
    return { amount: 0, remainingAmount, path: 'past-period', deadline, today }
  }

  const activeDays = Math.max(0, differenceInCalendarDays(pEnd, pStart) + 1)
  const totalDays = Math.max(1, differenceInCalendarDays(deadline, pStart))
  const amount = remainingAmount * (activeDays / totalDays)
  return { amount: round2(amount), remainingAmount, path: 'pro-rata', activeDays, totalDays, deadline, today }
}

export interface SuggestionGoalBreakdown {
  goalId: string
  name: string
  amount: number
}

export interface WalletSavingsSuggestion {
  wallet: Wallet
  currency: string
  amount: number
  contributingGoalCount: number
  goals: SuggestionGoalBreakdown[]
}

type TransferShape = Pick<
  Transaction,
  '_id' | 'transactionType' | 'walletId' | 'toWalletId' | 'amount' | 'currency' | 'toAmount' | 'toCurrency' | 'date'
>

// On a transfer `currency`/`amount` belong to the source wallet, so a transfer
// funded from another currency lands in the savings wallet as toAmount. Reading
// only `currency` nets nothing off and the suggestion never goes quiet.
function transferAmountReceived(tx: TransferShape, walletCurrency: string): number {
  if (tx.toCurrency === walletCurrency && tx.toAmount !== undefined) return tx.toAmount
  if (tx.currency === walletCurrency) return tx.amount
  return 0
}

export function computeSavingsSuggestionsByWallet(
  wallets: Pick<Wallet, '_id' | 'name' | 'currency' | 'isSavings'>[],
  goals: (Pick<SavingGoal, '_id' | 'walletId' | 'name' | 'targetAmount' | 'allocatedAmount' | 'targetDate' | 'achieved' | 'sourceRecurringPaymentId'> & ContributionShape)[],
  transactions: TransferShape[],
  periodStart: Date,
  periodEnd: Date,
  now?: Date,
  options?: { debug?: boolean },
): WalletSavingsSuggestion[] {
  const debug = options?.debug === true
  const savingsWallets = new Map<string, Pick<Wallet, '_id' | 'name' | 'currency' | 'isSavings'>>()
  for (const wallet of wallets) {
    if (wallet.isSavings === true) {
      savingsWallets.set(wallet._id, wallet)
    }
  }

  const accumulators = new Map<
    string,
    { sum: number; count: number; lines: string[]; goals: SuggestionGoalBreakdown[] }
  >()

  for (const goal of goals) {
    if (!savingsWallets.has(goal.walletId)) continue
    if (goal.achieved === true) continue

    if (goal.goalType !== 'contribution') {
      if (!goal.targetDate) continue

      const remainingAmount = Math.max((goal.targetAmount ?? 0) - goal.allocatedAmount, 0)
      if (remainingAmount <= 0) continue

      const goalDeadline = new Date(goal.targetDate)
      if (
        goalDeadline >= periodStart &&
        goalDeadline <= periodEnd &&
        goal.sourceRecurringPaymentId
      ) {
        continue
      }
    }

    const details = getPeriodSavingsSuggestion(goal, periodStart, periodEnd, now)
    if (details.amount > 0) {
      const existing = accumulators.get(goal.walletId) ?? { sum: 0, count: 0, lines: [], goals: [] }
      existing.sum += details.amount
      existing.count += 1
      existing.goals.push({ goalId: goal._id, name: goal.name, amount: details.amount })
      if (debug) {
        const label = goal.name || goal._id
        if (details.path === 'pro-rata') {
          existing.lines.push(
            `${label}: ${details.remainingAmount} × ${details.activeDays}/${details.totalDays} days = ${details.amount.toFixed(2)} (pro-rata)`,
          )
        } else if (details.path === 'in-period-pays-full') {
          existing.lines.push(
            `${label}: ${details.amount.toFixed(2)} (deadline ${details.deadline?.toISOString().slice(0, 10)} inside period → full remaining)`,
          )
        } else if (details.path === 'contribution') {
          existing.lines.push(
            `${label}: ${details.amount.toFixed(2)} (recurring contribution, ${goal.contributionPeriodType})`,
          )
        } else if (details.path === 'overdue-pays-full') {
          existing.lines.push(
            `${label}: ${details.amount.toFixed(2)} (overdue ${details.deadline?.toISOString().slice(0, 10)} → full remaining)`,
          )
        } else {
          existing.lines.push(`${label}: ${details.amount.toFixed(2)} (${details.path})`)
        }
      }
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
      const txDate = new Date(tx.date)
      if (txDate < periodStart || txDate > periodEnd) continue
      alreadyTransferred += transferAmountReceived(tx, wallet.currency)
    }

    const net = round2(Math.max(accumulator.sum - alreadyTransferred, 0))

    if (debug) {
      console.groupCollapsed(
        `[savings-suggestions] ${wallet.name} (${wallet.currency}) → ${net.toFixed(2)}`,
      )
      for (const line of accumulator.lines) {
        console.log('  ' + line)
      }
      console.log(
        `  Sum of goals: ${accumulator.sum.toFixed(2)} − already transferred ${alreadyTransferred.toFixed(2)} = ${net.toFixed(2)}`,
      )
      console.groupEnd()
    }

    if (net > 0) {
      results.push({
        wallet: wallet as Wallet,
        currency: wallet.currency,
        amount: net,
        contributingGoalCount: accumulator.count,
        goals: accumulator.goals,
      })
    }
  }

  results.sort((a, b) => a.wallet.name.localeCompare(b.wallet.name))
  return results
}
