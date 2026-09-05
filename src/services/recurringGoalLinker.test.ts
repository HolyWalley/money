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

// reconcileLinkedGoals reads the Yjs maps directly. It only ever calls
// .entries() on the outer map and .get() on an entry, so plain Maps stand in
// without dragging Yjs into the test.
const { yGoals, yPayments, mockUpdateSavingGoalCRDT } = vi.hoisted(() => ({
  yGoals: new Map<string, Map<string, unknown>>(),
  yPayments: new Map<string, Map<string, unknown>>(),
  mockUpdateSavingGoalCRDT: vi.fn(),
}))

vi.mock('../lib/crdts', () => ({
  savingGoals: yGoals,
  recurringPayments: yPayments,
  updateSavingGoal: (...args: unknown[]) => mockUpdateSavingGoalCRDT(...args),
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
  reconcileLinkedGoals,
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
    goalType: 'target',
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

function makeContributionDexieGoal(overrides: Record<string, unknown> = {}) {
  return makeDexieGoal({
    _id: 'goal-contribution',
    name: 'Travel',
    goalType: 'contribution',
    targetAmount: undefined,
    targetDate: undefined,
    contributionAmount: 100,
    contributionPeriodType: 'monthly',
    ...overrides,
  })
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
      goalType: 'target',
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
      goalType: 'target',
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

  it('rewrites a linked goal that lost its targetAmount instead of skipping the write', async () => {
    const next = new UTCDate(2026, 5, 1)
    mockGetOccurrencesInPeriod.mockReturnValue([next])
    mockGoalsToArray.mockResolvedValue([
      makeDexieGoal({
        _id: 'goal-existing',
        targetAmount: undefined,
        targetDate: next,
        walletId: 'wallet-savings',
      }),
    ])

    const rp = makeRP({ amount: 100, savingsWalletId: 'wallet-savings' })
    await syncLinkedGoal(rp)

    expect(mockUpdateGoal).toHaveBeenCalledWith('goal-existing', {
      goalType: 'target',
      targetAmount: 100,
      targetDate: next.toISOString(),
      walletId: 'wallet-savings',
    })
  })

  it('never writes to a contribution goal, even one carrying the link', async () => {
    const next = new UTCDate(2026, 5, 1)
    mockGetOccurrencesInPeriod.mockReturnValue([next])
    mockGoalsToArray.mockResolvedValue([
      makeContributionDexieGoal({ _id: 'goal-contribution' }),
    ])

    const rp = makeRP()
    await syncLinkedGoal(rp)

    expect(mockUpdateGoal).not.toHaveBeenCalled()
    expect(mockCreateGoal).toHaveBeenCalledWith(
      expect.objectContaining({ goalType: 'target', targetAmount: 100 })
    )
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
      goalType: 'target',
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

  it('relinks without a deadline when the replacement has no future occurrence', async () => {
    mockGoalsToArray.mockResolvedValue([
      makeDexieGoal({ _id: 'goal-active', sourceRecurringPaymentId: 'rp-old' }),
    ])
    mockGetOccurrencesInPeriod.mockReturnValue([])

    const prev = makeRP({ _id: 'rp-old' })
    const replacement = makeRP({ _id: 'rp-new', amount: 150 })

    await onRecurringPaymentReplaced(prev, replacement)

    expect(mockUpdateGoal).toHaveBeenCalledWith('goal-active', {
      sourceRecurringPaymentId: 'rp-new',
      goalType: 'target',
      targetAmount: 150,
      targetDate: undefined,
      walletId: 'wallet-savings',
    })
  })

  it('leaves a contribution goal alone and creates a target goal for the replacement', async () => {
    mockGoalsToArray.mockResolvedValue([
      makeContributionDexieGoal({ sourceRecurringPaymentId: 'rp-old' }),
    ])
    const next = new UTCDate(2026, 6, 1)
    mockGetOccurrencesInPeriod.mockReturnValue([next])

    const prev = makeRP({ _id: 'rp-old' })
    const replacement = makeRP({ _id: 'rp-new' })

    await onRecurringPaymentReplaced(prev, replacement)

    expect(mockUpdateGoal).not.toHaveBeenCalled()
    expect(mockCreateGoal).toHaveBeenCalledWith(
      expect.objectContaining({ goalType: 'target', sourceRecurringPaymentId: 'rp-new' })
    )
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

  it('does not touch contribution goals', async () => {
    mockGoalsToArray.mockResolvedValue([makeContributionDexieGoal()])

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

  it('maps a goal with no deadline to an undefined targetDate', async () => {
    mockGoalsToArray.mockResolvedValue([
      makeDexieGoal({ _id: 'g-1', targetDate: undefined }),
    ])

    const result = await findActiveLinkedGoal('rp-1')
    expect(result?.targetDate).toBeUndefined()
  })

  it('defaults goalType to target for a legacy row that predates the field', async () => {
    mockGoalsToArray.mockResolvedValue([
      makeDexieGoal({ _id: 'g-1', goalType: undefined }),
    ])

    const result = await findActiveLinkedGoal('rp-1')
    expect(result?.goalType).toBe('target')
  })

  it('skips contribution goals, which the linker must never manage', async () => {
    mockGoalsToArray.mockResolvedValue([makeContributionDexieGoal()])

    const result = await findActiveLinkedGoal('rp-1')
    expect(result).toBeUndefined()
  })

  it('returns the target goal when a contribution goal shares the link', async () => {
    mockGoalsToArray.mockResolvedValue([
      makeContributionDexieGoal(),
      makeDexieGoal({ _id: 'g-target' }),
    ])

    const result = await findActiveLinkedGoal('rp-1')
    expect(result?._id).toBe('g-target')
  })
})

describe('reconcileLinkedGoals', () => {
  function seedGoal(id: string, fields: Record<string, unknown>) {
    yGoals.set(id, new Map(Object.entries(fields)))
  }

  function seedPayment(id: string, fields: Record<string, unknown>) {
    yPayments.set(id, new Map(Object.entries(fields)))
  }

  function livePayment(id: string) {
    seedPayment(id, { isActive: true, savingsWalletId: 'pot-1' })
  }

  beforeEach(() => {
    yGoals.clear()
    yPayments.clear()
    mockUpdateSavingGoalCRDT.mockReset()
    // Apply the write so the second run of an idempotency test sees the result.
    mockUpdateSavingGoalCRDT.mockImplementation((id: string, updates: Record<string, unknown>) => {
      const goal = yGoals.get(id)
      if (!goal) return
      for (const [key, value] of Object.entries(updates)) goal.set(key, value)
    })
  })

  it('detaches a goal whose recurring payment no longer exists', () => {
    seedGoal('goal-1', { sourceRecurringPaymentId: 'rp-gone', achieved: false })

    expect(reconcileLinkedGoals()).toBe(1)
    expect(mockUpdateSavingGoalCRDT).toHaveBeenCalledWith('goal-1', { sourceRecurringPaymentId: '' })
  })

  it('detaches a goal whose recurring payment was deactivated', () => {
    seedGoal('goal-1', { sourceRecurringPaymentId: 'rp-1', achieved: false })
    seedPayment('rp-1', { isActive: false, savingsWalletId: 'pot-1' })

    expect(reconcileLinkedGoals()).toBe(1)
    expect(mockUpdateSavingGoalCRDT).toHaveBeenCalledWith('goal-1', { sourceRecurringPaymentId: '' })
  })

  it('detaches a goal whose recurring payment stopped saving up', () => {
    seedGoal('goal-1', { sourceRecurringPaymentId: 'rp-1', achieved: false })
    seedPayment('rp-1', { isActive: true, savingsWalletId: undefined })

    expect(reconcileLinkedGoals()).toBe(1)
    expect(mockUpdateSavingGoalCRDT).toHaveBeenCalledWith('goal-1', { sourceRecurringPaymentId: '' })
  })

  it('leaves a goal linked to a live recurring payment alone', () => {
    seedGoal('goal-1', { sourceRecurringPaymentId: 'rp-1', achieved: false })
    livePayment('rp-1')

    expect(reconcileLinkedGoals()).toBe(0)
    expect(mockUpdateSavingGoalCRDT).not.toHaveBeenCalled()
  })

  it('leaves achieved goals linked, since they record where they came from', () => {
    seedGoal('goal-1', { sourceRecurringPaymentId: 'rp-gone', achieved: true })

    expect(reconcileLinkedGoals()).toBe(0)
    expect(mockUpdateSavingGoalCRDT).not.toHaveBeenCalled()
  })

  it('ignores goals that were never linked', () => {
    seedGoal('goal-1', { achieved: false })
    seedGoal('goal-2', { sourceRecurringPaymentId: '', achieved: false })

    expect(reconcileLinkedGoals()).toBe(0)
    expect(mockUpdateSavingGoalCRDT).not.toHaveBeenCalled()
  })

  it('detaches only the orphaned goals and reports how many', () => {
    seedGoal('goal-live', { sourceRecurringPaymentId: 'rp-1', achieved: false })
    seedGoal('goal-orphan-a', { sourceRecurringPaymentId: 'rp-gone', achieved: false })
    seedGoal('goal-orphan-b', { sourceRecurringPaymentId: 'rp-off', achieved: false })
    livePayment('rp-1')
    seedPayment('rp-off', { isActive: false, savingsWalletId: 'pot-1' })

    expect(reconcileLinkedGoals()).toBe(2)
    expect(mockUpdateSavingGoalCRDT).toHaveBeenCalledTimes(2)
    expect(mockUpdateSavingGoalCRDT).not.toHaveBeenCalledWith('goal-live', expect.anything())
  })

  it('is idempotent, so running it on every start is free', () => {
    seedGoal('goal-1', { sourceRecurringPaymentId: 'rp-gone', achieved: false })

    expect(reconcileLinkedGoals()).toBe(1)
    expect(reconcileLinkedGoals()).toBe(0)
    expect(mockUpdateSavingGoalCRDT).toHaveBeenCalledTimes(1)
  })

  it('never touches contribution goals, which carry no link to reconcile', () => {
    seedGoal('goal-contribution', {
      goalType: 'contribution',
      contributionAmount: 100,
      contributionPeriodType: 'monthly',
      achieved: false,
    })
    seedGoal('goal-orphan', { sourceRecurringPaymentId: 'rp-gone', achieved: false })

    expect(reconcileLinkedGoals()).toBe(1)
    expect(mockUpdateSavingGoalCRDT).toHaveBeenCalledTimes(1)
    expect(mockUpdateSavingGoalCRDT).toHaveBeenCalledWith('goal-orphan', { sourceRecurringPaymentId: '' })
  })

  it('detaches nothing when there are no goals at all', () => {
    expect(reconcileLinkedGoals()).toBe(0)
    expect(mockUpdateSavingGoalCRDT).not.toHaveBeenCalled()
  })
})
