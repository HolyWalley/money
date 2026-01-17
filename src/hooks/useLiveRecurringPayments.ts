import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db-dexie'
import type { RecurringPayment } from '../../shared/schemas/recurring-payment.schema'

export function useLiveRecurringPayments(activeOnly = true) {
  const recurringPayments = useLiveQuery(async () => {
    let query = db.recurringPayments.orderBy('createdAt').reverse()

    if (activeOnly) {
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
  }, [activeOnly])

  return {
    recurringPayments: recurringPayments || [],
    isLoading: recurringPayments === undefined
  }
}
