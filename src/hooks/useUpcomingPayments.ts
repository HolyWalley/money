import { useMemo } from 'react'
import { useLiveRecurringPayments } from './useLiveRecurringPayments'
import { useLiveRecurringPaymentLogs } from './useLiveRecurringPaymentLogs'
import { getOccurrencesInPeriod, generateLogId } from '@/lib/recurring-utils'
import type { RecurringPayment } from '../../shared/schemas/recurring-payment.schema'

export interface UpcomingPayment {
  recurring: RecurringPayment
  scheduledDate: Date
  logId: string
  status: 'due' | 'upcoming'
}

export function useUpcomingPayments(periodStart: Date, periodEnd: Date) {
  const { recurringPayments, isLoading: isLoadingPayments } = useLiveRecurringPayments(true)
  const { logs, isLoading: isLoadingLogs } = useLiveRecurringPaymentLogs({
    periodStart,
    periodEnd
  })

  const loggedDatesByPaymentId = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const log of logs) {
      if (!map.has(log.recurringPaymentId)) {
        map.set(log.recurringPaymentId, new Set())
      }
      map.get(log.recurringPaymentId)!.add(log._id)
    }
    return map
  }, [logs])

  const upcomingPayments = useMemo(() => {
    const now = new Date()
    const payments: UpcomingPayment[] = []

    for (const recurring of recurringPayments) {
      const startDate = new Date(recurring.startDate)
      const endDate = recurring.endDate ? new Date(recurring.endDate) : undefined

      const effectiveEnd = endDate && endDate < periodEnd ? endDate : periodEnd

      const occurrences = getOccurrencesInPeriod(
        recurring.rrule,
        startDate,
        periodStart,
        effectiveEnd
      )

      const loggedDates = loggedDatesByPaymentId.get(recurring._id) || new Set()

      for (const occurrence of occurrences) {
        const logId = generateLogId(recurring._id, occurrence)

        if (loggedDates.has(logId)) {
          continue
        }

        const status: 'due' | 'upcoming' = occurrence <= now ? 'due' : 'upcoming'

        payments.push({
          recurring,
          scheduledDate: occurrence,
          logId,
          status
        })
      }
    }

    payments.sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime())

    return payments
  }, [recurringPayments, loggedDatesByPaymentId, periodStart, periodEnd])

  const dueCount = useMemo(() => {
    return upcomingPayments.filter(p => p.status === 'due').length
  }, [upcomingPayments])

  const upcomingCount = useMemo(() => {
    return upcomingPayments.filter(p => p.status === 'upcoming').length
  }, [upcomingPayments])

  return {
    payments: upcomingPayments,
    dueCount,
    upcomingCount,
    isLoading: isLoadingPayments || isLoadingLogs
  }
}
