import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useEventBus } from './useEventBus'
import { eventBus } from '@/lib/event-bus'
import type { Transaction } from '../../shared/schemas/transaction.schema'

const mockTransaction: Transaction = {
  _id: 'tx-1',
  type: 'transaction',
  transactionType: 'income',
  amount: 100,
  currency: 'USD',
  walletId: 'wallet-1',
  date: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  split: false,
  reimbursement: false,
  categoryId: 'cat-1',
}

describe('useEventBus', () => {
  it('subscribes to events on mount', () => {
    const handler = vi.fn()
    renderHook(() => useEventBus('transaction:created', handler))

    eventBus.emit('transaction:created', mockTransaction)

    expect(handler).toHaveBeenCalledWith(mockTransaction)
  })

  it('unsubscribes on unmount', () => {
    const handler = vi.fn()
    const { unmount } = renderHook(() => useEventBus('transaction:created', handler))

    unmount()
    eventBus.emit('transaction:created', mockTransaction)

    expect(handler).not.toHaveBeenCalled()
  })

  it('uses latest handler without re-subscribing', () => {
    const handler1 = vi.fn()
    const handler2 = vi.fn()

    const { rerender } = renderHook(
      ({ handler }) => useEventBus('transaction:created', handler),
      { initialProps: { handler: handler1 } },
    )

    rerender({ handler: handler2 })
    eventBus.emit('transaction:created', mockTransaction)

    expect(handler1).not.toHaveBeenCalled()
    expect(handler2).toHaveBeenCalledWith(mockTransaction)
  })
})
