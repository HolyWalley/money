import { differenceInCalendarMonths, isBefore, startOfDay } from 'date-fns'
import type { SavingGoal } from '../../shared/schemas/saving-goal.schema'

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
