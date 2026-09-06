import { useMemo } from 'react'
import { db } from '@/lib/db-dexie'
import { documentReady } from '@/lib/document-ready'
import { createSharedLiveQuery } from '@/lib/shared-live-query'
import type { RecurringPaymentLog } from '../../shared/schemas/recurring-payment.schema'

interface UseLiveRecurringPaymentLogsOptions {
  recurringPaymentId?: string
  periodStart?: Date
  periodEnd?: Date
}

export const recurringPaymentLogsStore = createSharedLiveQuery(async () => {
  const dexieLogs = await db.recurringPaymentLogs.orderBy('scheduledDate').toArray()

  return dexieLogs.map(log => ({
    ...log,
    scheduledDate: log.scheduledDate.toISOString(),
    createdAt: log.createdAt.toISOString()
  })) as RecurringPaymentLog[]
}, { after: documentReady, name: 'recurring payment logs' })

export function useLiveRecurringPaymentLogs(
  options: UseLiveRecurringPaymentLogsOptions = {}
): RecurringPaymentLog[] {
  const { recurringPaymentId, periodStart, periodEnd } = options
  const logs = recurringPaymentLogsStore()

  // Keyed on the instants, not the Date objects: callers build a fresh pair
  // every render.
  const periodStartTime = periodStart?.getTime()
  const periodEndTime = periodEnd?.getTime()

  return useMemo(() => {
    let filtered = logs

    if (recurringPaymentId) {
      filtered = filtered.filter(log => log.recurringPaymentId === recurringPaymentId)
    }

    if (periodStartTime !== undefined && periodEndTime !== undefined) {
      filtered = filtered.filter(log => {
        const scheduledAt = Date.parse(log.scheduledDate)
        return scheduledAt >= periodStartTime && scheduledAt <= periodEndTime
      })
    }

    return filtered
  }, [logs, recurringPaymentId, periodStartTime, periodEndTime])
}
