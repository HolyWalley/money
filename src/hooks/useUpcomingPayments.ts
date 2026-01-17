import { useMemo } from 'react'
import { useLiveRecurringPayments } from './useLiveRecurringPayments'
import { useLiveRecurringPaymentLogs } from './useLiveRecurringPaymentLogs'
import { useExchangeRates } from './useExchangeRates'
import { useAuth } from '@/contexts/AuthContext'
import { getOccurrencesInPeriod, generateLogId } from '@/lib/recurring-utils'
import { ExchangeRateService } from '../../shared/exchange-rates'
import type { RecurringPayment } from '../../shared/schemas/recurring-payment.schema'

export interface UpcomingPayment {
  recurring: RecurringPayment
  scheduledDate: Date
  logId: string
  status: 'due' | 'upcoming'
}

export function useUpcomingPayments(periodStart: Date, periodEnd: Date) {
  const { user } = useAuth()
  const baseCurrency = user?.settings?.defaultCurrency
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

  const { targetCurrencies, startDate, endDate } = useMemo(() => {
    if (!upcomingPayments.length || !baseCurrency) {
      return { targetCurrencies: [], startDate: undefined, endDate: undefined }
    }

    const currencies = new Set<string>()
    let minDate = upcomingPayments[0].scheduledDate
    let maxDate = upcomingPayments[0].scheduledDate

    for (const payment of upcomingPayments) {
      if (payment.scheduledDate < minDate) minDate = payment.scheduledDate
      if (payment.scheduledDate > maxDate) maxDate = payment.scheduledDate

      if (payment.recurring.currency !== baseCurrency) {
        currencies.add(payment.recurring.currency)
      }
    }

    return {
      targetCurrencies: Array.from(currencies),
      startDate: minDate,
      endDate: maxDate,
    }
  }, [upcomingPayments, baseCurrency])

  const { rates, isLoading: isLoadingRates } = useExchangeRates({
    baseCurrency,
    targetCurrencies,
    startDate,
    endDate,
  })

  const dueCount = useMemo(() => {
    return upcomingPayments.filter(p => p.status === 'due').length
  }, [upcomingPayments])

  const upcomingCount = useMemo(() => {
    return upcomingPayments.filter(p => p.status === 'upcoming').length
  }, [upcomingPayments])

  const { dueTotal, upcomingTotal } = useMemo(() => {
    if (!baseCurrency) {
      return { dueTotal: null, upcomingTotal: null }
    }

    let due = 0
    let upcoming = 0

    for (const payment of upcomingPayments) {
      const { recurring, scheduledDate, status } = payment
      let amountInBase: number

      if (recurring.currency === baseCurrency) {
        amountInBase = recurring.amount
      } else {
        const dateStr = scheduledDate.toISOString().split('T')[0]
        const cacheKey = ExchangeRateService.createCacheKey(baseCurrency, recurring.currency, dateStr)
        const rate = rates.get(cacheKey)

        if (!rate) {
          continue
        }

        amountInBase = recurring.amount / rate
      }

      if (status === 'due') {
        due += amountInBase
      } else {
        upcoming += amountInBase
      }
    }

    return { dueTotal: due, upcomingTotal: upcoming }
  }, [upcomingPayments, baseCurrency, rates])

  return {
    payments: upcomingPayments,
    dueCount,
    upcomingCount,
    dueTotal,
    upcomingTotal,
    baseCurrency,
    isLoading: isLoadingPayments || isLoadingLogs || isLoadingRates
  }
}
