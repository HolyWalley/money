import { useEventBus } from '@/hooks/useEventBus'
import {
  syncLinkedGoal,
  onRecurringPaymentLogged,
  onRecurringPaymentSkipped,
  detachLinkedGoals,
} from '@/services/recurringGoalLinker'

export function RecurringGoalLinkSubscriber() {
  useEventBus('recurringPayment:created', async (rp) => {
    try {
      if (rp.savingsWalletId) await syncLinkedGoal(rp)
    } catch (e) {
      console.error('linker syncLinkedGoal (created) failed:', e)
    }
  })

  useEventBus('recurringPayment:updated', async ({ rp, prev }) => {
    try {
      const wasLinked = !!prev.savingsWalletId
      const isLinked = !!rp.savingsWalletId
      if (wasLinked && !isLinked) {
        await detachLinkedGoals(rp._id)
      } else if (isLinked) {
        await syncLinkedGoal(rp)
      }
    } catch (e) {
      console.error('linker (updated) failed:', e)
    }
  })

  useEventBus('recurringPayment:logged', async ({ rp, scheduledDate }) => {
    try {
      if (rp.savingsWalletId) {
        await onRecurringPaymentLogged(rp, new Date(scheduledDate))
      }
    } catch (e) {
      console.error('linker (logged) failed:', e)
    }
  })

  useEventBus('recurringPayment:skipped', async ({ rp, scheduledDate }) => {
    try {
      if (rp.savingsWalletId) {
        await onRecurringPaymentSkipped(rp, new Date(scheduledDate))
      }
    } catch (e) {
      console.error('linker (skipped) failed:', e)
    }
  })

  useEventBus('recurringPayment:deactivated', async (rp) => {
    try {
      await detachLinkedGoals(rp._id)
    } catch (e) {
      console.error('linker (deactivated) failed:', e)
    }
  })

  useEventBus('recurringPayment:deleted', async (rpId) => {
    try {
      await detachLinkedGoals(rpId)
    } catch (e) {
      console.error('linker (deleted) failed:', e)
    }
  })

  return null
}
