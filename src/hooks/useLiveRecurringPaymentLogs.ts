import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db-dexie'
import type { RecurringPaymentLog } from '../../shared/schemas/recurring-payment.schema'

interface UseLiveRecurringPaymentLogsOptions {
  recurringPaymentId?: string
  periodStart?: Date
  periodEnd?: Date
}

export function useLiveRecurringPaymentLogs(options: UseLiveRecurringPaymentLogsOptions = {}) {
  const { recurringPaymentId, periodStart, periodEnd } = options

  const logs = useLiveQuery(async () => {
    let query = db.recurringPaymentLogs.orderBy('scheduledDate')

    if (recurringPaymentId) {
      query = query.filter(log => log.recurringPaymentId === recurringPaymentId)
    }

    if (periodStart && periodEnd) {
      query = query.filter(log => {
        return log.scheduledDate >= periodStart && log.scheduledDate <= periodEnd
      })
    }

    const dexieLogs = await query.toArray()

    return dexieLogs.map(log => ({
      ...log,
      scheduledDate: log.scheduledDate.toISOString(),
      createdAt: log.createdAt.toISOString()
    })) as RecurringPaymentLog[]
  }, [recurringPaymentId, periodStart?.getTime(), periodEnd?.getTime()])

  return {
    logs: logs || [],
    isLoading: logs === undefined
  }
}
