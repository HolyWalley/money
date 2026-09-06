import { waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { UTCDate } from '@date-fns/utc'
import { db } from '@/lib/db-dexie'
import { resetSharedLiveQueries } from '@/lib/shared-live-query'
import { renderHookSuspended } from '@/test/suspense'
import { recurringPaymentLogsStore, useLiveRecurringPaymentLogs } from './useLiveRecurringPaymentLogs'

function log(id: string, recurringPaymentId: string, scheduledDate: string) {
  return {
    _id: id,
    recurringPaymentId,
    scheduledDate: new UTCDate(scheduledDate),
    status: 'logged' as const,
    createdAt: new UTCDate('2026-01-01T00:00:00.000Z'),
  }
}

const ids = (logs: { _id: string }[]) => logs.map(l => l._id)

const FEBRUARY: { periodStart: Date; periodEnd: Date } = {
  periodStart: new UTCDate('2026-02-05T00:00:00.000Z'),
  periodEnd: new UTCDate('2026-02-28T23:59:59.999Z'),
}

describe('useLiveRecurringPaymentLogs', () => {
  beforeEach(async () => {
    resetSharedLiveQueries()
    await db.recurringPaymentLogs.clear()
    await db.recurringPaymentLogs.bulkAdd([
      log('mar', 'rent', '2026-03-05T00:00:00.000Z'),
      log('jan', 'rent', '2026-01-05T00:00:00.000Z'),
      log('feb-gym', 'gym', '2026-02-10T00:00:00.000Z'),
      log('feb', 'rent', '2026-02-05T00:00:00.000Z'),
      log('feb-last', 'gym', '2026-02-28T23:59:59.999Z'),
    ])
  })

  it('keeps the logs scheduled inside the period, both ends included, in date order', async () => {
    const { result } = await renderHookSuspended(() => useLiveRecurringPaymentLogs(FEBRUARY))
    await waitFor(() => expect(result.current).toHaveLength(3))

    expect(ids(result.current)).toEqual(['feb', 'feb-gym', 'feb-last'])
  })

  it('narrows to one recurring payment inside the period', async () => {
    const { result } = await renderHookSuspended(() =>
      useLiveRecurringPaymentLogs({ ...FEBRUARY, recurringPaymentId: 'gym' })
    )
    await waitFor(() => expect(result.current).toHaveLength(2))

    expect(ids(result.current)).toEqual(['feb-gym', 'feb-last'])
  })

  it('answers the whole store, untouched, without options', async () => {
    const { result } = await renderHookSuspended(() => useLiveRecurringPaymentLogs())
    await waitFor(() => expect(result.current).toHaveLength(5))

    expect(result.current).toBe(recurringPaymentLogsStore.peek())
    expect(ids(result.current)).toEqual(['jan', 'feb', 'feb-gym', 'feb-last', 'mar'])
    expect(result.current[0].scheduledDate).toBe('2026-01-05T00:00:00.000Z')
  })

  it('keeps the memo when the period is rebuilt from the same instants', async () => {
    const { result, rerender } = await renderHookSuspended(
      (period: { periodStart: Date; periodEnd: Date }) => useLiveRecurringPaymentLogs(period),
      { initialProps: FEBRUARY }
    )
    await waitFor(() => expect(result.current).toHaveLength(3))

    const before = result.current
    rerender({
      periodStart: new Date(FEBRUARY.periodStart.getTime()),
      periodEnd: new Date(FEBRUARY.periodEnd.getTime()),
    })
    expect(result.current).toBe(before)

    rerender({
      periodStart: new UTCDate('2026-03-01T00:00:00.000Z'),
      periodEnd: new UTCDate('2026-03-31T23:59:59.999Z'),
    })
    expect(ids(result.current)).toEqual(['mar'])
  })
})
