import { db } from '@/lib/db-dexie'
import { createKeyedSharedLiveQuery } from '@/lib/shared-live-query'
import type { RecurringPayment } from '../../shared/schemas/recurring-payment.schema'

const EMPTY_RECURRING_PAYMENTS: RecurringPayment[] = []

const useSharedRecurringPayments = createKeyedSharedLiveQuery(async (scope: string) => {
  let query = db.recurringPayments.orderBy('createdAt').reverse()

  if (scope === 'active') {
    query = query.filter(rp => rp.isActive)
  }

  const dexiePayments = await query.toArray()

  return dexiePayments.map(rp => ({
    ...rp,
    startDate: rp.startDate.toISOString(),
    endDate: rp.endDate?.toISOString(),
    createdAt: rp.createdAt.toISOString(),
    updatedAt: rp.updatedAt.toISOString()
  })) as RecurringPayment[]
})

export function useLiveRecurringPayments(activeOnly = true) {
  const recurringPayments = useSharedRecurringPayments(activeOnly ? 'active' : 'all')

  return {
    recurringPayments: recurringPayments || EMPTY_RECURRING_PAYMENTS,
    isLoading: recurringPayments === undefined
  }
}
