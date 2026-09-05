import { isSameDay } from 'date-fns'
import type { SavingGoal } from '../../shared/schemas/saving-goal.schema'

export interface LinkedGoalFunding {
  goalId: string
  targetDate: Date
  allocatedAmount: number
}

// Mirrors recurringGoalLinker.findActiveLinkedGoal so the two never disagree
// about which goal is funding a payment: the first unachieved, non-contribution
// goal pointing at it. Contribution goals are excluded there and here because
// they have no deadline and no ceiling — they save towards nothing in
// particular, so they cannot cover a specific payment.
export function buildLinkedGoalFunding(goals: SavingGoal[]): Map<string, LinkedGoalFunding> {
  const byPaymentId = new Map<string, LinkedGoalFunding>()

  for (const goal of goals) {
    const sourceId = goal.sourceRecurringPaymentId
    if (!sourceId) continue
    if (goal.achieved) continue
    if (goal.goalType === 'contribution') continue
    if (!goal.targetDate) continue
    if (byPaymentId.has(sourceId)) continue

    byPaymentId.set(sourceId, {
      goalId: goal._id,
      // Dexie hands back a Date here while the type says string, so this has to
      // survive both.
      targetDate: new Date(goal.targetDate),
      allocatedAmount: goal.allocatedAmount,
    })
  }

  return byPaymentId
}

// A payment that falls twice inside one period still has a single deadline, and
// crediting the saved amount against both occurrences would claim money that
// only exists once.
export function savedForOccurrence(
  funding: LinkedGoalFunding | undefined,
  occurrence: Date,
): number {
  if (!funding) return 0
  if (!isSameDay(funding.targetDate, occurrence)) return 0
  return Math.max(funding.allocatedAmount, 0)
}

// What still has to come out of the current account. Over-funding a goal — by
// hand, or by lowering the payment after allocating — must not push the total
// below zero and start cancelling out other payments.
export function outstandingAmount(amount: number, saved: number): number {
  return Math.max(amount - saved, 0)
}
