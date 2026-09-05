import { addYears, isSameDay, startOfDay } from 'date-fns'
import { db } from '../lib/db-dexie'
import {
  recurringPayments as yRecurringPayments,
  savingGoals as ySavingGoals,
  updateSavingGoal as updateSavingGoalCRDT,
} from '../lib/crdts'
import { generateLogId, getOccurrencesInPeriod } from '../lib/recurring-utils'
import { savingGoalService } from './savingGoalService'
import type { RecurringPayment } from '../../shared/schemas/recurring-payment.schema'
import type { SavingGoal } from '../../shared/schemas/saving-goal.schema'

export async function findNextScheduledOccurrence(
  rp: RecurringPayment,
  now: Date = new Date()
): Promise<Date | undefined> {
  const periodStart = startOfDay(now)
  const periodEnd = addYears(now, 5)

  const startDate = new Date(rp.startDate)
  const endDate = rp.endDate ? new Date(rp.endDate) : undefined

  const occurrences = getOccurrencesInPeriod(rp.rrule, startDate, periodStart, periodEnd)

  for (const occurrence of occurrences) {
    if (endDate && occurrence > endDate) {
      continue
    }
    const logId = generateLogId(rp._id, occurrence)
    const existingLog = await db.recurringPaymentLogs.get(logId)
    if (!existingLog) {
      return occurrence
    }
  }

  return undefined
}

export async function findActiveLinkedGoal(rpId: string): Promise<SavingGoal | undefined> {
  const goals = await db.savingGoals
    .where('sourceRecurringPaymentId')
    .equals(rpId)
    .toArray()

  const active = goals.find(g => !g.achieved && g.goalType !== 'contribution')
  if (!active) return undefined

  return {
    ...active,
    goalType: active.goalType ?? 'target',
    targetDate: active.targetDate ? active.targetDate.toISOString() : undefined,
    createdAt: active.createdAt.toISOString(),
    updatedAt: active.updatedAt.toISOString(),
  } as SavingGoal
}

export async function syncLinkedGoal(rp: RecurringPayment): Promise<void> {
  if (!rp.savingsWalletId || !rp.isActive) return

  const next = await findNextScheduledOccurrence(rp)
  if (!next) return

  const active = await findActiveLinkedGoal(rp._id)

  const wantsTargetAmount = rp.amount
  const wantsTargetDate = next.toISOString()
  const wantsWalletId = rp.savingsWalletId

  if (active) {
    if (
      active.targetAmount === wantsTargetAmount &&
      active.targetDate === wantsTargetDate &&
      active.walletId === wantsWalletId
    ) {
      return
    }
    await savingGoalService.updateGoal(active._id, {
      goalType: 'target',
      targetAmount: wantsTargetAmount,
      targetDate: wantsTargetDate,
      walletId: wantsWalletId,
    })
    return
  }

  await savingGoalService.createGoal({
    walletId: wantsWalletId,
    name: rp.description?.trim() || 'Recurring payment',
    goalType: 'target',
    targetAmount: wantsTargetAmount,
    targetDate: wantsTargetDate,
    sourceRecurringPaymentId: rp._id,
  })
}

export async function onRecurringPaymentLogged(
  rp: RecurringPayment,
  scheduledDate: Date
): Promise<void> {
  const active = await findActiveLinkedGoal(rp._id)
  if (active && active.targetDate && isSameDay(new Date(active.targetDate), scheduledDate)) {
    await savingGoalService.updateGoal(active._id, { achieved: true })
  }
  await syncLinkedGoal(rp)
}

export async function onRecurringPaymentSkipped(
  rp: RecurringPayment,
  scheduledDate: Date
): Promise<void> {
  const active = await findActiveLinkedGoal(rp._id)
  if (active && active.targetDate && isSameDay(new Date(active.targetDate), scheduledDate)) {
    await savingGoalService.deleteGoal(active._id)
  }
  await syncLinkedGoal(rp)
}

export async function onRecurringPaymentReplaced(
  prev: RecurringPayment,
  replacement: RecurringPayment
): Promise<void> {
  const active = await findActiveLinkedGoal(prev._id)

  if (!active) {
    if (replacement.savingsWalletId) {
      await syncLinkedGoal(replacement)
    }
    return
  }

  if (!replacement.savingsWalletId || !replacement.isActive) {
    await savingGoalService.updateGoal(active._id, { sourceRecurringPaymentId: '' })
    return
  }

  const next = await findNextScheduledOccurrence(replacement)
  await savingGoalService.updateGoal(active._id, {
    sourceRecurringPaymentId: replacement._id,
    goalType: 'target',
    targetAmount: replacement.amount,
    targetDate: next?.toISOString(),
    walletId: replacement.savingsWalletId,
  })
}

export async function detachLinkedGoals(rpId: string): Promise<void> {
  const active = await findActiveLinkedGoal(rpId)
  if (active) {
    await savingGoalService.updateGoal(active._id, { sourceRecurringPaymentId: '' })
  }
}

/**
 * A goal's link is otherwise maintained only by RecurringGoalLinkSubscriber
 * reacting to an in-memory event. If the tab dies between the payment changing
 * and that handler running, the event is gone and nothing ever clears the link,
 * so a goal keeps pointing at a payment that no longer applies — which silently
 * drops it out of savings suggestions. The invariant is re-derivable, so it is
 * checked at startup rather than made durable.
 *
 * Reads the Yjs maps rather than the Dexie mirror on purpose. The mirror is
 * written asynchronously by observers, so shortly after load it can hold the
 * goals without yet holding the payments — which would look exactly like every
 * goal being orphaned. The caller must still await crdtReady.
 *
 * Achieved goals keep their link: detachLinkedGoals only ever detaches the
 * active one, and the link is that goal's record of where it came from.
 */
export function reconcileLinkedGoals(): number {
  let detached = 0

  for (const [goalId, goal] of ySavingGoals.entries()) {
    const sourceId = goal.get('sourceRecurringPaymentId')
    if (typeof sourceId !== 'string' || sourceId === '') continue
    if (goal.get('achieved') === true) continue

    const rp = yRecurringPayments.get(sourceId)
    // The three conditions the subscriber detaches on: deleted, deactivated,
    // and savings switched off on a payment that still exists.
    if (rp && rp.get('isActive') === true && rp.get('savingsWalletId')) continue

    updateSavingGoalCRDT(goalId, { sourceRecurringPaymentId: '' })
    detached++
  }

  return detached
}

export const recurringGoalLinker = {
  findNextScheduledOccurrence,
  findActiveLinkedGoal,
  syncLinkedGoal,
  onRecurringPaymentLogged,
  onRecurringPaymentSkipped,
  onRecurringPaymentReplaced,
  detachLinkedGoals,
  reconcileLinkedGoals,
}
