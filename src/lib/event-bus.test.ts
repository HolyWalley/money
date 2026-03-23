import { describe, it, expect, vi } from 'vitest'
import { eventBus } from './event-bus'
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

describe('eventBus', () => {
  it('calls handler when event is emitted', () => {
    const handler = vi.fn()
    const unbind = eventBus.on('transaction:created', handler)

    eventBus.emit('transaction:created', mockTransaction)

    expect(handler).toHaveBeenCalledWith(mockTransaction)
    unbind()
  })

  it('stops calling handler after unbind', () => {
    const handler = vi.fn()
    const unbind = eventBus.on('transaction:created', handler)

    unbind()
    eventBus.emit('transaction:created', mockTransaction)

    expect(handler).not.toHaveBeenCalled()
  })

  it('supports multiple listeners on the same event', () => {
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    const unbind1 = eventBus.on('transaction:created', handler1)
    const unbind2 = eventBus.on('transaction:created', handler2)

    eventBus.emit('transaction:created', mockTransaction)

    expect(handler1).toHaveBeenCalledWith(mockTransaction)
    expect(handler2).toHaveBeenCalledWith(mockTransaction)
    unbind1()
    unbind2()
  })

  it('only unbinds the specific listener', () => {
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    const unbind1 = eventBus.on('transaction:created', handler1)
    const unbind2 = eventBus.on('transaction:created', handler2)

    unbind1()
    eventBus.emit('transaction:created', mockTransaction)

    expect(handler1).not.toHaveBeenCalled()
    expect(handler2).toHaveBeenCalledWith(mockTransaction)
    unbind2()
  })
})
