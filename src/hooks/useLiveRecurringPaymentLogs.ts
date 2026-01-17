import { useState, useEffect } from 'react'
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

  const periodStartTime = periodStart?.getTime()
  const periodEndTime = periodEnd?.getTime()

  const [readyPeriod, setReadyPeriod] = useState<{ start?: number; end?: number }>({})

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

    return {
      logs: dexieLogs.map(log => ({
        ...log,
        scheduledDate: log.scheduledDate.toISOString(),
        createdAt: log.createdAt.toISOString()
      })) as RecurringPaymentLog[],
      periodStartTime,
      periodEndTime,
    }
  }, [recurringPaymentId, periodStartTime, periodEndTime])

  useEffect(() => {
    if (logs) {
      setReadyPeriod({ start: logs.periodStartTime, end: logs.periodEndTime })
    }
  }, [logs])

  const isPeriodStale = readyPeriod.start !== periodStartTime || readyPeriod.end !== periodEndTime

  return {
    logs: logs?.logs || [],
    isLoading: logs === undefined || isPeriodStale
  }
}
