import { renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { format } from 'date-fns'
import { useUpcomingPayments } from './useUpcomingPayments'
import type { RecurringPayment } from '../../shared/schemas/recurring-payment.schema'

const mocks = vi.hoisted(() => ({
  recurringPayments: [] as RecurringPayment[],
  loggedDates: [] as string[],
}))

vi.mock('./useLiveRecurringPayments', () => ({
  useLiveRecurringPayments: () => ({
    recurringPayments: mocks.recurringPayments,
    isLoading: false,
  }),
}))

// Models the real query: it reads only the logs inside the window it is handed,
// so a hook that widens the occurrence window without widening this one shows
// payments that were in fact already logged.
vi.mock('./useLiveRecurringPaymentLogs', () => ({
  useLiveRecurringPaymentLogs: ({ periodStart, periodEnd }: { periodStart?: Date; periodEnd?: Date }) => ({
    logs: mocks.loggedDates
      .map(day => ({ _id: `rp-1_${day}`, recurringPaymentId: 'rp-1', scheduledDate: new Date(`${day}T12:00:00`) }))
      .filter(log => !periodStart || !periodEnd || (log.scheduledDate >= periodStart && log.scheduledDate <= periodEnd)),
    isLoading: false,
  }),
}))

vi.mock('./useLiveSavingGoals', () => ({
  useLiveSavingGoals: () => ({ goals: [], isLoading: false }),
}))

// Monthly, on the 5th, starting September 2026.
const monthlyRent: RecurringPayment = {
  _id: 'rp-1',
  amount: 1200,
  currency: 'EUR',
  categoryId: 'c-1',
  walletId: 'w-1',
  transactionType: 'expense',
  description: 'Rent',
  rrule: 'FREQ=MONTHLY',
  startDate: new Date(2026, 8, 5).toISOString(),
  isActive: true,
  sourceTransactionId: 't-1',
  createdAt: new Date(2026, 8, 1).toISOString(),
  updatedAt: new Date(2026, 8, 1).toISOString(),
}

function scheduledDays(periodStart: Date, periodEnd: Date): string[] {
  const { result } = renderHook(() => useUpcomingPayments(periodStart, periodEnd))
  return result.current.payments.map(p => format(p.scheduledDate, 'yyyy-MM-dd'))
}

describe('useUpcomingPayments', () => {
  beforeEach(() => {
    mocks.recurringPayments = [monthlyRent]
    mocks.loggedDates = []
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 15, 9, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // A payment that was never logged is still owed once the calendar page turns.
  it('carries an unlogged payment into the next period', () => {
    expect(scheduledDays(new Date(2026, 9, 1), new Date(2026, 9, 31, 23, 59, 59)))
      .toEqual(['2026-09-05', '2026-10-05'])
  })

  it('marks a carried-over payment as due', () => {
    const { result } = renderHook(() =>
      useUpcomingPayments(new Date(2026, 9, 1), new Date(2026, 9, 31, 23, 59, 59))
    )

    expect(result.current.payments[0].status).toBe('due')
    expect(result.current.dueCount).toBe(2)
  })

  it('counts a carried-over payment towards what is still owed', () => {
    const { result } = renderHook(() =>
      useUpcomingPayments(new Date(2026, 9, 1), new Date(2026, 9, 31, 23, 59, 59))
    )

    expect(result.current.totalsByCurrency.get('EUR')).toBe(2400)
  })

  // The log lives outside the displayed period, so finding it means the hook
  // widened its log query along with its occurrence window.
  it('leaves behind a payment that was logged in an earlier period', () => {
    mocks.loggedDates = ['2026-09-05']

    expect(scheduledDays(new Date(2026, 9, 1), new Date(2026, 9, 31, 23, 59, 59)))
      .toEqual(['2026-10-05'])
  })

  // Browsing away from today is a plain window on the period being read. Today's
  // arrears belong to today's view: showing them in December would double-count
  // them, and in an already-settled month would be pure noise.
  it('does not pull arrears into a future period', () => {
    expect(scheduledDays(new Date(2026, 11, 1), new Date(2026, 11, 31, 23, 59, 59)))
      .toEqual(['2026-12-05'])
  })

  it('does not pull arrears into a past period', () => {
    expect(scheduledDays(new Date(2026, 8, 1), new Date(2026, 8, 30, 23, 59, 59)))
      .toEqual(['2026-09-05'])
  })

  // Arrears stop somewhere: an abandoned daily payment would otherwise put a
  // year of rows in front of the current month.
  it('carries over at most the three most recent unlogged occurrences', () => {
    mocks.recurringPayments = [{
      ...monthlyRent,
      rrule: 'FREQ=MONTHLY',
      startDate: new Date(2026, 0, 5).toISOString(),
    }]

    expect(scheduledDays(new Date(2026, 9, 1), new Date(2026, 9, 31, 23, 59, 59)))
      .toEqual(['2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05'])
  })

  it('stops carrying over once the payment is no longer active', () => {
    mocks.recurringPayments = [{
      ...monthlyRent,
      endDate: new Date(2026, 8, 30).toISOString(),
    }]

    expect(scheduledDays(new Date(2026, 9, 1), new Date(2026, 9, 31, 23, 59, 59)))
      .toEqual(['2026-09-05'])
  })
})
