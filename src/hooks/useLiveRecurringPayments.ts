import { useMemo } from 'react'
import { db } from '@/lib/db-dexie'
import { documentReady } from '@/lib/document-ready'
import { createSharedLiveQuery } from '@/lib/shared-live-query'
import type { RecurringPayment } from '../../shared/schemas/recurring-payment.schema'

export const recurringPaymentsStore = createSharedLiveQuery(async () => {
  const dexiePayments = await db.recurringPayments.orderBy('createdAt').reverse().toArray()

  return dexiePayments.map(rp => ({
    ...rp,
    startDate: rp.startDate.toISOString(),
    endDate: rp.endDate?.toISOString(),
    createdAt: rp.createdAt.toISOString(),
    updatedAt: rp.updatedAt.toISOString()
  })) as RecurringPayment[]
}, { after: documentReady, name: 'recurring payments' })

export function useLiveRecurringPayments(activeOnly = true): RecurringPayment[] {
  const recurringPayments = recurringPaymentsStore()

  return useMemo(
    () => (activeOnly ? recurringPayments.filter(rp => rp.isActive) : recurringPayments),
    [recurringPayments, activeOnly]
  )
}
