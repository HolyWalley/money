import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UTCDate } from '@date-fns/utc'

const mockLogsGet = vi.fn()
const mockGoalsWhere = vi.fn()
const mockGoalsEquals = vi.fn()
const mockGoalsToArray = vi.fn()

vi.mock('../lib/db-dexie', () => ({
  db: {
    recurringPaymentLogs: {
      get: (...args: unknown[]) => mockLogsGet(...args),
    },
    savingGoals: {
      where: (...args: unknown[]) => mockGoalsWhere(...args),
    },
  },
}))

const mockGetOccurrencesInPeriod = vi.fn()
const mockGenerateLogId = vi.fn(
  (rpId: string, date: Date) => `${rpId}_${date.toISOString().slice(0, 10)}`
)

vi.mock('../lib/recurring-utils', () => ({
  getOccurrencesInPeriod: (...args: unknown[]) => mockGetOccurrencesInPeriod(...args),
  generateLogId: (...args: unknown[]) => mockGenerateLogId(...(args as [string, Date])),
}))

const mockCreateGoal = vi.fn()
const mockUpdateGoal = vi.fn()
const mockDeleteGoal = vi.fn()

vi.mock('./savingGoalService', () => ({
  savingGoalService: {
    createGoal: (...args: unknown[]) => mockCreateGoal(...args),
    updateGoal: (...args: unknown[]) => mockUpdateGoal(...args),
    deleteGoal: (...args: unknown[]) => mockDeleteGoal(...args),
  },
}))

import {
  findNextScheduledOccurrence,
  findActiveLinkedGoal,
  syncLinkedGoal,
  onRecurringPaymentLogged,
  onRecurringPaymentSkipped,
  onRecurringPaymentReplaced,
  detachLinkedGoals,
} from './recurringGoalLinker'

import type { RecurringPayment } from '../../shared/schemas/recurring-payment.schema'

function makeRP(overrides: Partial<RecurringPayment> = {}): RecurringPayment {
  return {
    _id: 'rp-1',
    amount: 100,
    currency: 'USD',
    categoryId: 'cat-1',
    walletId: 'wallet-source',
    transactionType: 'expense',
    description: 'Rent',
    rrule: 'FREQ=MONTHLY;BYMONTHDAY=1',
    startDate: new UTCDate(2026, 0, 1).toISOString(),
    isActive: true,
    sourceTransactionId: 'tx-1',
    savingsWalletId: 'wallet-savings',
    createdAt: new UTCDate(2026, 0, 1).toISOString(),
    updatedAt: new UTCDate(2026, 0, 1).toISOString(),
    ...overrides,
  }
}

function makeDexieGoal(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'goal-1',
    walletId: 'wallet-savings',
    name: 'Rent',
    targetAmount: 100,
    allocatedAmount: 0,
    achieved: false,
    order: 0,
    targetDate: new UTCDate(2026, 5, 1),
    sourceRecurringPaymentId: 'rp-1',
    createdAt: new UTCDate(2026, 0, 1),
    updatedAt: new UTCDate(2026, 0, 1),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGoalsWhere.mockReturnValue({ equals: mockGoalsEquals })
  mockGoalsEquals.mockReturnValue({ toArray: mockGoalsToArray })
  mockGoalsToArray.mockResolvedValue([])
  mockLogsGet.mockResolvedValue(undefined)
  mockGetOccurrencesInPeriod.mockReturnValue([])
})

describe('findNextScheduledOccurrence', () => {
  it('returns the first occurrence with no log row', async () => {
    const occurrences = [
      new UTCDate(2026, 5, 1),
      new UTCDate(2026, 6, 1),
      new UTCDate(2026, 7, 1),
    ]
    mockGetOccurrencesInPeriod.mockReturnValue(occurrences)
    mockLogsGet.mockResolvedValue(undefined)

    const rp = makeRP()
    const result = await findNextScheduledOccurrence(rp, new UTCDate(2026, 4, 15))

    expect(result).toEqual(occurrences[0])
    expect(mockLogsGet).toHaveBeenCalledTimes(1)
  })

  it('skips occurrences that have a logged log row', async () => {
    const occurrences = [
      new UTCDate(2026, 5, 1),
      new UTCDate(2026, 6, 1),
    ]
    mockGetOccurrencesInPeriod.mockReturnValue(occurrences)
    mockLogsGet.mockImplementation(async (logId: string) => {
      if (logId.endsWith('2026-06-01')) {
        return {
          _id: logId,
          recurringPaymentId: 'rp-1',
          scheduledDate: new Date(),
          status: 'logged',
          transactionId: 'tx-x',
          createdAt: new Date(),
        }
      }
      return undefined
    })

    const rp = makeRP()
    const result = await findNextScheduledOccurrence(rp, new UTCDate(2026, 4, 15))

    expect(result).toEqual(occurrences[1])
  })

  it('skips occurrences that have a skipped log row', async () => {
    const occurrences = [
      new UTCDate(2026, 5, 1),
      new UTCDate(2026, 6, 1),
    ]
    mockGetOccurrencesInPeriod.mockReturnValue(occurrences)
    mockLogsGet.mockImplementation(async (logId: string) => {
      if (logId.endsWith('2026-06-01')) {
        return {
          _id: logId,
          recurringPaymentId: 'rp-1',
          scheduledDate: new Date(),
          status: 'skipped',
          createdAt: new Date(),
        }
      }
      return undefined
    })

    const rp = makeRP()
    const result = await findNextScheduledOccurrence(rp, new UTCDate(2026, 4, 15))

    expect(result).toEqual(occurrences[1])
  })

  it('returns undefined when no future occurrences exist within the 5-year window', async () => {
    mockGetOccurrencesInPeriod.mockReturnValue([])
    const rp = makeRP()
    const result = await findNextScheduledOccurrence(rp, new UTCDate(2026, 4, 15))
    expect(result).toBeUndefined()
  })
})

describe('syncLinkedGoal', () => {
  it('creates a goal when none exists and savingsWalletId + isActive are set', async () => {
    const next = new UTCDate(2026, 5, 1)
    mockGetOccurrencesInPeriod.mockReturnValue([next])
    mockGoalsToArray.mockResolvedValue([])

    const rp = makeRP({ description: 'Rent payment' })
    await syncLinkedGoal(rp)

    expect(mockCreateGoal).toHaveBeenCalledWith({
      walletId: 'wallet-savings',
      name: 'Rent payment',
      targetAmount: 100,
      targetDate: next.toISOString(),
      sourceRecurringPaymentId: 'rp-1',
    })
    expect(mockUpdateGoal).not.toHaveBeenCalled()
  })

  it('falls back to "Recurring payment" when description is empty/whitespace', async () => {
    const next = new UTCDate(2026, 5, 1)
    mockGetOccurrencesInPeriod.mockReturnValue([next])
    mockGoalsToArray.mockResolvedValue([])

    const rp = makeRP({ description: '   ' })
    await syncLinkedGoal(rp)

    expect(mockCreateGoal).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Recurring payment' })
    )
  })

  it('updates targetAmount/targetDate/walletId on existing active goal without touching name or allocatedAmount', async () => {
    const next = new UTCDate(2026, 5, 1)
    mockGetOccurrencesInPeriod.mockReturnValue([next])
    mockGoalsToArray.mockResolvedValue([
      makeDexieGoal({
        _id: 'goal-existing',
        targetAmount: 50,
        targetDate: new UTCDate(2026, 4, 1),
        walletId: 'wallet-other',
      }),
    ])

    const rp = makeRP({ amount: 250, savingsWalletId: 'wallet-savings' })
    await syncLinkedGoal(rp)

    expect(mockUpdateGoal).toHaveBeenCalledTimes(1)
    expect(mockUpdateGoal).toHaveBeenCalledWith('goal-existing', {
      targetAmount: 250,
      targetDate: next.toISOString(),
      walletId: 'wallet-savings',
    })
    expect(mockCreateGoal).not.toHaveBeenCalled()
  })

  it('skips the write when targetAmount/targetDate/walletId all already match', async () => {
    const next = new UTCDate(2026, 5, 1)
    mockGetOccurrencesInPeriod.mockReturnValue([next])
    mockGoalsToArray.mockResolvedValue([
      makeDexieGoal({
        _id: 'goal-existing',
        targetAmount: 100,
        targetDate: next,
        walletId: 'wallet-savings',
      }),
    ])

    const rp = makeRP({ amount: 100, savingsWalletId: 'wallet-savings' })
    await syncLinkedGoal(rp)

    expect(mockUpdateGoal).not.toHaveBeenCalled()
    expect(mockCreateGoal).not.toHaveBeenCalled()
  })

  it('no-ops when savingsWalletId is unset', async () => {
    const rp = makeRP({ savingsWalletId: undefined })
    await syncLinkedGoal(rp)

    expect(mockGetOccurrencesInPeriod).not.toHaveBeenCalled()
    expect(mockCreateGoal).not.toHaveBeenCalled()
    expect(mockUpdateGoal).not.toHaveBeenCalled()
  })

  it('no-ops when rp.isActive is false', async () => {
    const rp = makeRP({ isActive: false })
    await syncLinkedGoal(rp)

    expect(mockGetOccurrencesInPeriod).not.toHaveBeenCalled()
    expect(mockCreateGoal).not.toHaveBeenCalled()
    expect(mockUpdateGoal).not.toHaveBeenCalled()
  })

  it('no-ops when there are no future occurrences', async () => {
    mockGetOccurrencesInPeriod.mockReturnValue([])
    const rp = makeRP()
    await syncLinkedGoal(rp)

    expect(mockCreateGoal).not.toHaveBeenCalled()
    expect(mockUpdateGoal).not.toHaveBeenCalled()
  })
})

describe('onRecurringPaymentReplaced', () => {
  it('relinks active linked goal to replacement and preserves allocation', async () => {
    const activeGoal = makeDexieGoal({
      _id: 'goal-active',
      allocatedAmount: 40,
      sourceRecurringPaymentId: 'rp-old',
    })
    mockGoalsToArray.mockResolvedValue([activeGoal])
    const next = new UTCDate(2026, 6, 1)
    mockGetOccurrencesInPeriod.mockReturnValue([next])
    mockLogsGet.mockResolvedValue(undefined)

    const prev = makeRP({ _id: 'rp-old' })
    const replacement = makeRP({
      _id: 'rp-new',
      amount: 150,
      savingsWalletId: 'wallet-new-savings',
    })

    await onRecurringPaymentReplaced(prev, replacement)

    expect(mockUpdateGoal).toHaveBeenCalledWith('goal-active', {
      sourceRecurringPaymentId: 'rp-new',
      targetAmount: 150,
      targetDate: next.toISOString(),
      walletId: 'wallet-new-savings',
    })
  })

  it('detaches active linked goal when replacement has no savings wallet', async () => {
    mockGoalsToArray.mockResolvedValue([
      makeDexieGoal({ _id: 'goal-active', sourceRecurringPaymentId: 'rp-old' }),
    ])

    const prev = makeRP({ _id: 'rp-old' })
    const replacement = makeRP({ _id: 'rp-new', savingsWalletId: undefined })

    await onRecurringPaymentReplaced(prev, replacement)

    expect(mockUpdateGoal).toHaveBeenCalledWith('goal-active', {
      sourceRecurringPaymentId: '',
    })
  })

  it('syncs replacement when no active linked goal exists and savings is enabled', async () => {
    mockGoalsToArray.mockResolvedValue([])
    const next = new UTCDate(2026, 6, 1)
    mockGetOccurrencesInPeriod.mockReturnValue([next])
    mockLogsGet.mockResolvedValue(undefined)

    const prev = makeRP({ _id: 'rp-old' })
    const replacement = makeRP({ _id: 'rp-new', savingsWalletId: 'wallet-savings' })

    await onRecurringPaymentReplaced(prev, replacement)

    expect(mockCreateGoal).toHaveBeenCalledWith(expect.objectContaining({
      sourceRecurringPaymentId: 'rp-new',
      walletId: 'wallet-savings',
      targetDate: next.toISOString(),
    }))
  })
})

describe('onRecurringPaymentLogged', () => {
  it('marks active goal achieved and spawns new goal when targetDate matches scheduledDate', async () => {
    const scheduled = new UTCDate(2026, 5, 1)
    const nextAfter = new UTCDate(2026, 6, 1)

    mockGoalsToArray
      .mockResolvedValueOnce([
        makeDexieGoal({
          _id: 'goal-current',
          targetDate: scheduled,
        }),
      ])
      .mockResolvedValueOnce([])

    mockGetOccurrencesInPeriod.mockReturnValue([nextAfter])

    const rp = makeRP()
    await onRecurringPaymentLogged(rp, scheduled)

    expect(mockUpdateGoal).toHaveBeenCalledWith('goal-current', { achieved: true })
    expect(mockCreateGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        targetDate: nextAfter.toISOString(),
        sourceRecurringPaymentId: 'rp-1',
      })
    )
  })

  it('does not modify active goal when targetDate does not match (future log) but still calls sync (no-op)', async () => {
    const scheduled = new UTCDate(2026, 6, 1)
    const activeTargetDate = new UTCDate(2026, 5, 1)

    mockGoalsToArray.mockResolvedValue([
      makeDexieGoal({
        _id: 'goal-current',
        targetDate: activeTargetDate,
        targetAmount: 100,
        walletId: 'wallet-savings',
      }),
    ])
    mockGetOccurrencesInPeriod.mockReturnValue([activeTargetDate])
    mockLogsGet.mockResolvedValue(undefined)

    const rp = makeRP({ amount: 100, savingsWalletId: 'wallet-savings' })
    await onRecurringPaymentLogged(rp, scheduled)

    expect(mockUpdateGoal).not.toHaveBeenCalled()
    expect(mockCreateGoal).not.toHaveBeenCalled()
  })
})

describe('onRecurringPaymentSkipped', () => {
  it('deletes active goal when matched and spawns a new one', async () => {
    const scheduled = new UTCDate(2026, 5, 1)
    const nextAfter = new UTCDate(2026, 6, 1)

    mockGoalsToArray
      .mockResolvedValueOnce([
        makeDexieGoal({
          _id: 'goal-current',
          targetDate: scheduled,
        }),
      ])
      .mockResolvedValueOnce([])

    mockGetOccurrencesInPeriod.mockReturnValue([nextAfter])

    const rp = makeRP()
    await onRecurringPaymentSkipped(rp, scheduled)

    expect(mockDeleteGoal).toHaveBeenCalledWith('goal-current')
    expect(mockCreateGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        targetDate: nextAfter.toISOString(),
        sourceRecurringPaymentId: 'rp-1',
      })
    )
  })

  it('leaves active goal untouched when unmatched (future skip)', async () => {
    const scheduled = new UTCDate(2026, 6, 1)
    const activeTargetDate = new UTCDate(2026, 5, 1)

    mockGoalsToArray.mockResolvedValue([
      makeDexieGoal({
        _id: 'goal-current',
        targetDate: activeTargetDate,
        targetAmount: 100,
        walletId: 'wallet-savings',
      }),
    ])
    mockGetOccurrencesInPeriod.mockReturnValue([activeTargetDate])
    mockLogsGet.mockResolvedValue(undefined)

    const rp = makeRP({ amount: 100, savingsWalletId: 'wallet-savings' })
    await onRecurringPaymentSkipped(rp, scheduled)

    expect(mockDeleteGoal).not.toHaveBeenCalled()
    expect(mockCreateGoal).not.toHaveBeenCalled()
    expect(mockUpdateGoal).not.toHaveBeenCalled()
  })
})

describe('detachLinkedGoals', () => {
  it('clears link on the active (non-achieved) goal', async () => {
    mockGoalsToArray.mockResolvedValue([
      makeDexieGoal({ _id: 'goal-active', achieved: false }),
    ])

    await detachLinkedGoals('rp-1')

    expect(mockUpdateGoal).toHaveBeenCalledWith('goal-active', { sourceRecurringPaymentId: '' })
  })

  it('does not touch achieved goals (findActiveLinkedGoal filters them out)', async () => {
    mockGoalsToArray.mockResolvedValue([
      makeDexieGoal({ _id: 'goal-old', achieved: true }),
    ])

    await detachLinkedGoals('rp-1')

    expect(mockUpdateGoal).not.toHaveBeenCalled()
  })

  it('no-ops when there is no linked goal', async () => {
    mockGoalsToArray.mockResolvedValue([])
    await detachLinkedGoals('rp-1')
    expect(mockUpdateGoal).not.toHaveBeenCalled()
  })
})

describe('findActiveLinkedGoal', () => {
  it('returns undefined when no goals exist', async () => {
    mockGoalsToArray.mockResolvedValue([])
    const result = await findActiveLinkedGoal('rp-1')
    expect(result).toBeUndefined()
  })

  it('returns the first non-achieved goal converted to schema form', async () => {
    mockGoalsToArray.mockResolvedValue([
      makeDexieGoal({ _id: 'g-1', achieved: true }),
      makeDexieGoal({ _id: 'g-2', achieved: false, targetDate: new UTCDate(2026, 5, 1) }),
    ])

    const result = await findActiveLinkedGoal('rp-1')
    expect(result?._id).toBe('g-2')
    expect(result?.targetDate).toBe(new UTCDate(2026, 5, 1).toISOString())
    expect(typeof result?.createdAt).toBe('string')
    expect(typeof result?.updatedAt).toBe('string')
  })
})
