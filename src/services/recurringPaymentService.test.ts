import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRecurringPaymentsGet = vi.fn()
const mockRecurringLogsWhere = vi.fn()
const mockRecurringLogsEquals = vi.fn()
const mockRecurringLogsCount = vi.fn()

vi.mock('../lib/db-dexie', () => ({
  db: {
    recurringPayments: {
      get: (...args: unknown[]) => mockRecurringPaymentsGet(...args),
    },
    recurringPaymentLogs: {
      where: (...args: unknown[]) => mockRecurringLogsWhere(...args),
    },
  },
}))

const mockAddRecurringPayment = vi.fn()
const mockUpdateRecurringPayment = vi.fn()
const mockDeleteRecurringPayment = vi.fn()
const mockAddRecurringPaymentLog = vi.fn()
const mockAddTransaction = vi.fn()
const mockUpdateTransaction = vi.fn()

vi.mock('../lib/crdts', () => ({
  addRecurringPayment: (...args: unknown[]) => mockAddRecurringPayment(...args),
  updateRecurringPayment: (...args: unknown[]) => mockUpdateRecurringPayment(...args),
  deleteRecurringPayment: (...args: unknown[]) => mockDeleteRecurringPayment(...args),
  addRecurringPaymentLog: (...args: unknown[]) => mockAddRecurringPaymentLog(...args),
  addTransaction: (...args: unknown[]) => mockAddTransaction(...args),
  updateTransaction: (...args: unknown[]) => mockUpdateTransaction(...args),
}))

const mockEventEmit = vi.fn()

vi.mock('../lib/event-bus', () => ({
  eventBus: {
    emit: (...args: unknown[]) => mockEventEmit(...args),
  },
}))

vi.mock('../lib/recurring-utils', () => ({
  generateLogId: (rpId: string, date: Date) => `${rpId}_${date.toISOString().slice(0, 10)}`,
}))

import { recurringPaymentService } from './recurringPaymentService'

function makeDexieRecurringPayment(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'rp-1',
    amount: 100,
    currency: 'USD',
    categoryId: 'cat-1',
    walletId: 'wallet-1',
    transactionType: 'expense',
    description: 'Rent',
    rrule: 'FREQ=MONTHLY;BYMONTHDAY=1',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: undefined,
    isActive: true,
    sourceTransactionId: 'tx-1',
    savingsWalletId: 'savings-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRecurringPaymentsGet.mockResolvedValue(makeDexieRecurringPayment())
  mockRecurringLogsWhere.mockReturnValue({ equals: mockRecurringLogsEquals })
  mockRecurringLogsEquals.mockReturnValue({ count: mockRecurringLogsCount })
  mockRecurringLogsCount.mockResolvedValue(0)
  mockAddRecurringPayment.mockReturnValue('rp-replacement')
})

describe('recurringPaymentService.updateRecurringPaymentDetails', () => {
  it('updates payment details in place even when logs exist', async () => {
    mockRecurringLogsCount.mockResolvedValue(2)

    const result = await recurringPaymentService.updateRecurringPaymentDetails('rp-1', {
      amount: 125,
      description: 'Updated rent',
    })

    expect(mockRecurringLogsWhere).not.toHaveBeenCalled()
    expect(mockUpdateRecurringPayment).toHaveBeenCalledWith('rp-1', {
      amount: 125,
      description: 'Updated rent',
    })
    expect(mockAddRecurringPayment).not.toHaveBeenCalled()
    expect(mockEventEmit).toHaveBeenCalledWith('recurringPayment:updated', expect.objectContaining({
      rp: expect.objectContaining({ _id: 'rp-1', amount: 125, description: 'Updated rent' }),
      prev: expect.objectContaining({ _id: 'rp-1', amount: 100, description: 'Rent' }),
    }))
    expect(result._id).toBe('rp-1')
    expect(result.amount).toBe(125)
  })

  it('updates schedule in place when there are no logs', async () => {
    mockRecurringLogsCount.mockResolvedValue(0)

    const result = await recurringPaymentService.updateRecurringPaymentDetails('rp-1', {
      startDate: '2026-01-05T00:00:00.000Z',
    })

    expect(mockRecurringLogsWhere).toHaveBeenCalledWith('recurringPaymentId')
    expect(mockRecurringLogsEquals).toHaveBeenCalledWith('rp-1')
    expect(mockUpdateRecurringPayment).toHaveBeenCalledWith('rp-1', {
      startDate: '2026-01-05T00:00:00.000Z',
    })
    expect(mockAddRecurringPayment).not.toHaveBeenCalled()
    expect(mockEventEmit).toHaveBeenCalledWith('recurringPayment:updated', expect.any(Object))
    expect(result._id).toBe('rp-1')
    expect(result.startDate).toBe('2026-01-05T00:00:00.000Z')
  })

  it('replaces the recurring payment when startDate changes and logs exist', async () => {
    mockRecurringLogsCount.mockResolvedValue(1)

    const result = await recurringPaymentService.updateRecurringPaymentDetails('rp-1', {
      startDate: '2026-01-05T00:00:00.000Z',
      amount: 150,
      savingsWalletId: undefined,
    })

    expect(mockUpdateRecurringPayment).toHaveBeenCalledWith('rp-1', { isActive: false })
    expect(mockAddRecurringPayment).toHaveBeenCalledWith(expect.objectContaining({
      amount: 150,
      currency: 'USD',
      categoryId: 'cat-1',
      walletId: 'wallet-1',
      transactionType: 'expense',
      description: 'Rent',
      rrule: 'FREQ=MONTHLY;BYMONTHDAY=1',
      startDate: '2026-01-05T00:00:00.000Z',
      sourceTransactionId: 'tx-1',
    }))
    expect(mockAddRecurringPayment.mock.calls[0][0].savingsWalletId).toBeUndefined()
    expect(mockAddRecurringPaymentLog).not.toHaveBeenCalled()
    expect(mockEventEmit).toHaveBeenCalledWith('recurringPayment:replaced', {
      prev: expect.objectContaining({ _id: 'rp-1', startDate: '2026-01-01T00:00:00.000Z' }),
      replacement: expect.objectContaining({
        _id: 'rp-replacement',
        amount: 150,
        startDate: '2026-01-05T00:00:00.000Z',
        isActive: true,
      }),
    })
    expect(result._id).toBe('rp-replacement')
  })

  it('replaces the recurring payment when rrule changes and logs exist', async () => {
    mockRecurringLogsCount.mockResolvedValue(1)

    const result = await recurringPaymentService.updateRecurringPaymentDetails('rp-1', {
      rrule: 'FREQ=MONTHLY;BYMONTHDAY=5',
    })

    expect(mockUpdateRecurringPayment).toHaveBeenCalledWith('rp-1', { isActive: false })
    expect(mockAddRecurringPayment).toHaveBeenCalledWith(expect.objectContaining({
      rrule: 'FREQ=MONTHLY;BYMONTHDAY=5',
      startDate: '2026-01-01T00:00:00.000Z',
    }))
    expect(mockAddRecurringPaymentLog).not.toHaveBeenCalled()
    expect(mockEventEmit).toHaveBeenCalledWith('recurringPayment:replaced', expect.objectContaining({
      prev: expect.objectContaining({ _id: 'rp-1' }),
      replacement: expect.objectContaining({ _id: 'rp-replacement' }),
    }))
    expect(result.rrule).toBe('FREQ=MONTHLY;BYMONTHDAY=5')
  })
})
