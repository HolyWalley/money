import { describe, it, expect } from 'vitest'
import {
  savingGoalSchema,
  createSavingGoalSchema,
  updateSavingGoalSchema,
} from './saving-goal.schema'

describe('saving-goal.schema', () => {
  describe('savingGoalSchema', () => {
    it('validates a complete saving goal', () => {
      const result = savingGoalSchema.safeParse({
        _id: 'goal-1',
        walletId: 'wallet-1',
        name: 'New Camera',
        targetAmount: 500,
        allocatedAmount: 100,
        achieved: false,
        order: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      expect(result.success).toBe(true)
    })

    it('applies defaults for allocatedAmount and achieved', () => {
      const result = savingGoalSchema.safeParse({
        _id: 'goal-1',
        walletId: 'wallet-1',
        name: 'New Camera',
        targetAmount: 500,
        order: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.allocatedAmount).toBe(0)
        expect(result.data.achieved).toBe(false)
      }
    })

    it('rejects empty name', () => {
      const result = savingGoalSchema.safeParse({
        _id: 'goal-1',
        walletId: 'wallet-1',
        name: '',
        targetAmount: 500,
        order: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      expect(result.success).toBe(false)
    })

    it('rejects negative target amount', () => {
      const result = savingGoalSchema.safeParse({
        _id: 'goal-1',
        walletId: 'wallet-1',
        name: 'Goal',
        targetAmount: -100,
        order: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      expect(result.success).toBe(false)
    })

    it('rejects zero target amount', () => {
      const result = savingGoalSchema.safeParse({
        _id: 'goal-1',
        walletId: 'wallet-1',
        name: 'Goal',
        targetAmount: 0,
        order: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      expect(result.success).toBe(false)
    })

    it('rejects negative allocated amount', () => {
      const result = savingGoalSchema.safeParse({
        _id: 'goal-1',
        walletId: 'wallet-1',
        name: 'Goal',
        targetAmount: 500,
        allocatedAmount: -10,
        order: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      expect(result.success).toBe(false)
    })

    it('rejects name longer than 100 characters', () => {
      const result = savingGoalSchema.safeParse({
        _id: 'goal-1',
        walletId: 'wallet-1',
        name: 'a'.repeat(101),
        targetAmount: 500,
        order: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      expect(result.success).toBe(false)
    })

    it('validates a goal with a valid ISO targetDate', () => {
      const result = savingGoalSchema.safeParse({
        _id: 'goal-1',
        walletId: 'wallet-1',
        name: 'New Camera',
        targetAmount: 500,
        order: 0,
        targetDate: '2026-12-31T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.targetDate).toBe('2026-12-31T00:00:00.000Z')
      }
    })

    it('validates a goal when targetDate is omitted', () => {
      const result = savingGoalSchema.safeParse({
        _id: 'goal-1',
        walletId: 'wallet-1',
        name: 'New Camera',
        targetAmount: 500,
        order: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.targetDate).toBeUndefined()
      }
    })

    it('rejects a goal with a non-ISO targetDate string', () => {
      const result = savingGoalSchema.safeParse({
        _id: 'goal-1',
        walletId: 'wallet-1',
        name: 'New Camera',
        targetAmount: 500,
        order: 0,
        targetDate: 'not-a-date',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      expect(result.success).toBe(false)
    })

    it('parses a goal with sourceRecurringPaymentId set', () => {
      const result = savingGoalSchema.safeParse({
        _id: 'goal-1',
        walletId: 'wallet-1',
        name: 'New Camera',
        targetAmount: 500,
        order: 0,
        sourceRecurringPaymentId: 'rp-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.sourceRecurringPaymentId).toBe('rp-1')
      }
    })

    it('parses a goal without sourceRecurringPaymentId', () => {
      const result = savingGoalSchema.safeParse({
        _id: 'goal-1',
        walletId: 'wallet-1',
        name: 'New Camera',
        targetAmount: 500,
        order: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.sourceRecurringPaymentId).toBeUndefined()
      }
    })
  })

  describe('createSavingGoalSchema', () => {
    it('validates create data with required fields', () => {
      const result = createSavingGoalSchema.safeParse({
        walletId: 'wallet-1',
        name: 'New Camera',
        targetAmount: 500,
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing walletId', () => {
      const result = createSavingGoalSchema.safeParse({
        name: 'New Camera',
        targetAmount: 500,
      })
      expect(result.success).toBe(false)
    })

    it('rejects missing name', () => {
      const result = createSavingGoalSchema.safeParse({
        walletId: 'wallet-1',
        targetAmount: 500,
      })
      expect(result.success).toBe(false)
    })

    it('rejects missing targetAmount', () => {
      const result = createSavingGoalSchema.safeParse({
        walletId: 'wallet-1',
        name: 'New Camera',
      })
      expect(result.success).toBe(false)
    })

    it('accepts targetDate when provided', () => {
      const result = createSavingGoalSchema.safeParse({
        walletId: 'wallet-1',
        name: 'New Camera',
        targetAmount: 500,
        targetDate: '2026-12-31T00:00:00.000Z',
      })
      expect(result.success).toBe(true)
    })

    it('accepts the absence of targetDate', () => {
      const result = createSavingGoalSchema.safeParse({
        walletId: 'wallet-1',
        name: 'New Camera',
        targetAmount: 500,
      })
      expect(result.success).toBe(true)
    })
  })

  describe('updateSavingGoalSchema', () => {
    it('validates partial updates', () => {
      const result = updateSavingGoalSchema.safeParse({
        name: 'Updated Name',
      })
      expect(result.success).toBe(true)
    })

    it('validates empty update', () => {
      const result = updateSavingGoalSchema.safeParse({})
      expect(result.success).toBe(true)
    })

    it('validates update with targetAmount', () => {
      const result = updateSavingGoalSchema.safeParse({
        targetAmount: 1000,
      })
      expect(result.success).toBe(true)
    })

    it('validates update with achieved flag', () => {
      const result = updateSavingGoalSchema.safeParse({
        achieved: true,
      })
      expect(result.success).toBe(true)
    })

    it('validates update with allocatedAmount', () => {
      const result = updateSavingGoalSchema.safeParse({
        allocatedAmount: 250,
      })
      expect(result.success).toBe(true)
    })

    it('rejects negative targetAmount in update', () => {
      const result = updateSavingGoalSchema.safeParse({
        targetAmount: -100,
      })
      expect(result.success).toBe(false)
    })

    it('validates a partial update containing only targetDate', () => {
      const result = updateSavingGoalSchema.safeParse({
        targetDate: '2026-12-31T00:00:00.000Z',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.targetDate).toBe('2026-12-31T00:00:00.000Z')
      }
    })
  })

  describe('goalType backwards compatibility', () => {
    it('defaults goalType to target when absent on an existing goal', () => {
      const result = savingGoalSchema.safeParse({
        _id: 'goal-1',
        walletId: 'wallet-1',
        name: 'Legacy Goal',
        targetAmount: 500,
        allocatedAmount: 100,
        achieved: false,
        order: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.goalType).toBe('target')
        expect(result.data.contributionAmount).toBeUndefined()
        expect(result.data.contributionPeriodType).toBeUndefined()
      }
    })

    it('defaults goalType to target on create data', () => {
      const result = createSavingGoalSchema.safeParse({
        walletId: 'wallet-1',
        name: 'New Camera',
        targetAmount: 500,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.goalType).toBe('target')
      }
    })

    it('leaves goalType undefined on a partial update that omits it', () => {
      const result = updateSavingGoalSchema.safeParse({ name: 'Renamed' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.goalType).toBeUndefined()
      }
    })

    it('rejects an unknown goalType', () => {
      const result = savingGoalSchema.safeParse({
        _id: 'goal-1',
        walletId: 'wallet-1',
        name: 'Goal',
        goalType: 'recurring',
        targetAmount: 500,
        order: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('target goals', () => {
    const base = {
      _id: 'goal-1',
      walletId: 'wallet-1',
      name: 'New Camera',
      goalType: 'target' as const,
      order: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    it('validates an explicit target goal', () => {
      const result = savingGoalSchema.safeParse({ ...base, targetAmount: 500, targetDate: '2026-12-31T00:00:00.000Z' })
      expect(result.success).toBe(true)
    })

    it('requires targetAmount', () => {
      const result = savingGoalSchema.safeParse({ ...base })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some(i => i.path[0] === 'targetAmount')).toBe(true)
      }
    })

    it.each([
      ['contributionAmount', 100],
      ['contributionPeriodType', 'monthly'],
      ['contributionMonthDay', 15],
      ['contributionWeekDay', 1],
      ['contributionYearDay', 100],
    ])('rejects %s on a target goal', (field, value) => {
      const result = savingGoalSchema.safeParse({ ...base, targetAmount: 500, [field]: value })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some(i => i.path[0] === field)).toBe(true)
      }
    })
  })

  describe('contribution goals', () => {
    const base = {
      _id: 'goal-1',
      walletId: 'wallet-1',
      name: 'Travel',
      goalType: 'contribution' as const,
      contributionAmount: 100,
      allocatedAmount: 0,
      achieved: false,
      order: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    it('validates a monthly contribution goal with an anchor day', () => {
      const result = savingGoalSchema.safeParse({
        ...base,
        contributionPeriodType: 'monthly',
        contributionMonthDay: 15,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.goalType).toBe('contribution')
        expect(result.data.contributionAmount).toBe(100)
        expect(result.data.contributionPeriodType).toBe('monthly')
        expect(result.data.contributionMonthDay).toBe(15)
        expect(result.data.targetAmount).toBeUndefined()
        expect(result.data.targetDate).toBeUndefined()
      }
    })

    it.each(['weekly', 'monthly', 'yearly'])('validates a %s contribution goal without an anchor day', (periodType) => {
      const result = savingGoalSchema.safeParse({ ...base, contributionPeriodType: periodType })
      expect(result.success).toBe(true)
    })

    it('validates a weekly contribution goal anchored on Sunday', () => {
      const result = savingGoalSchema.safeParse({
        ...base,
        contributionPeriodType: 'weekly',
        contributionWeekDay: 0,
      })
      expect(result.success).toBe(true)
    })

    it('validates a yearly contribution goal anchored on day 366', () => {
      const result = savingGoalSchema.safeParse({
        ...base,
        contributionPeriodType: 'yearly',
        contributionYearDay: 366,
      })
      expect(result.success).toBe(true)
    })

    it('requires contributionAmount', () => {
      const result = savingGoalSchema.safeParse({
        ...base,
        contributionAmount: undefined,
        contributionPeriodType: 'monthly',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some(i => i.path[0] === 'contributionAmount')).toBe(true)
      }
    })

    it('requires contributionPeriodType', () => {
      const result = savingGoalSchema.safeParse({ ...base })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some(i => i.path[0] === 'contributionPeriodType')).toBe(true)
      }
    })

    it.each([0, -100])('rejects a contributionAmount of %s', (amount) => {
      const result = savingGoalSchema.safeParse({
        ...base,
        contributionAmount: amount,
        contributionPeriodType: 'monthly',
      })
      expect(result.success).toBe(false)
    })

    it('rejects an unsupported contributionPeriodType', () => {
      const result = savingGoalSchema.safeParse({ ...base, contributionPeriodType: 'daily' })
      expect(result.success).toBe(false)
    })

    it('rejects targetAmount on a contribution goal', () => {
      const result = savingGoalSchema.safeParse({
        ...base,
        contributionPeriodType: 'monthly',
        targetAmount: 500,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some(i => i.path[0] === 'targetAmount')).toBe(true)
      }
    })

    it('rejects targetDate on a contribution goal', () => {
      const result = savingGoalSchema.safeParse({
        ...base,
        contributionPeriodType: 'monthly',
        targetDate: '2026-12-31T00:00:00.000Z',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some(i => i.path[0] === 'targetDate')).toBe(true)
      }
    })

    it.each([
      ['monthly', 'contributionWeekDay', 1],
      ['monthly', 'contributionYearDay', 100],
      ['weekly', 'contributionMonthDay', 15],
      ['weekly', 'contributionYearDay', 100],
      ['yearly', 'contributionMonthDay', 15],
      ['yearly', 'contributionWeekDay', 1],
    ])('rejects a %s goal carrying %s', (periodType, field, value) => {
      const result = savingGoalSchema.safeParse({
        ...base,
        contributionPeriodType: periodType,
        [field]: value,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some(i => i.path[0] === field)).toBe(true)
      }
    })

    it.each([
      ['contributionMonthDay', 0],
      ['contributionMonthDay', 32],
      ['contributionMonthDay', 1.5],
      ['contributionWeekDay', -1],
      ['contributionWeekDay', 7],
      ['contributionYearDay', 0],
      ['contributionYearDay', 367],
    ])('rejects an out-of-range %s of %s', (field, value) => {
      const periodType = field === 'contributionMonthDay'
        ? 'monthly'
        : field === 'contributionWeekDay' ? 'weekly' : 'yearly'
      const result = savingGoalSchema.safeParse({
        ...base,
        contributionPeriodType: periodType,
        [field]: value,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('createSavingGoalSchema with contribution goals', () => {
    it('validates contribution create data', () => {
      const result = createSavingGoalSchema.safeParse({
        walletId: 'wallet-1',
        name: 'Travel',
        goalType: 'contribution',
        contributionAmount: 100,
        contributionPeriodType: 'monthly',
        contributionMonthDay: 1,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.contributionAmount).toBe(100)
        expect(result.data.contributionMonthDay).toBe(1)
      }
    })

    it('rejects contribution create data without a contributionAmount', () => {
      const result = createSavingGoalSchema.safeParse({
        walletId: 'wallet-1',
        name: 'Travel',
        goalType: 'contribution',
        contributionPeriodType: 'monthly',
      })
      expect(result.success).toBe(false)
    })

    it('rejects contribution create data without a contributionPeriodType', () => {
      const result = createSavingGoalSchema.safeParse({
        walletId: 'wallet-1',
        name: 'Travel',
        goalType: 'contribution',
        contributionAmount: 100,
      })
      expect(result.success).toBe(false)
    })

    it('rejects target create data carrying contribution fields', () => {
      const result = createSavingGoalSchema.safeParse({
        walletId: 'wallet-1',
        name: 'New Camera',
        goalType: 'target',
        targetAmount: 500,
        contributionAmount: 100,
      })
      expect(result.success).toBe(false)
    })

    it('rejects contribution create data carrying a targetAmount', () => {
      const result = createSavingGoalSchema.safeParse({
        walletId: 'wallet-1',
        name: 'Travel',
        goalType: 'contribution',
        contributionAmount: 100,
        contributionPeriodType: 'monthly',
        targetAmount: 500,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('updateSavingGoalSchema leniency', () => {
    it('accepts a goalType-only patch for contribution without demanding the rest', () => {
      const result = updateSavingGoalSchema.safeParse({ goalType: 'contribution' })
      expect(result.success).toBe(true)
    })

    it('accepts a goalType-only patch for target without demanding a targetAmount', () => {
      const result = updateSavingGoalSchema.safeParse({ goalType: 'target' })
      expect(result.success).toBe(true)
    })

    it('accepts a contributionAmount-only patch', () => {
      const result = updateSavingGoalSchema.safeParse({ contributionAmount: 250 })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.contributionAmount).toBe(250)
      }
    })

    it('accepts an anchor-day-only patch when the period type is absent', () => {
      const result = updateSavingGoalSchema.safeParse({ contributionWeekDay: 3 })
      expect(result.success).toBe(true)
    })

    it('accepts a matching period type and anchor day', () => {
      const result = updateSavingGoalSchema.safeParse({
        contributionPeriodType: 'monthly',
        contributionMonthDay: 15,
      })
      expect(result.success).toBe(true)
    })

    it('rejects a mismatched period type and anchor day', () => {
      const result = updateSavingGoalSchema.safeParse({
        contributionPeriodType: 'monthly',
        contributionWeekDay: 1,
      })
      expect(result.success).toBe(false)
    })

    it('rejects a patch mixing goalType target with contribution fields', () => {
      const result = updateSavingGoalSchema.safeParse({
        goalType: 'target',
        contributionAmount: 100,
      })
      expect(result.success).toBe(false)
    })

    it('rejects a patch mixing goalType contribution with a targetAmount', () => {
      const result = updateSavingGoalSchema.safeParse({
        goalType: 'contribution',
        targetAmount: 500,
      })
      expect(result.success).toBe(false)
    })

    it('rejects a patch mixing goalType contribution with a targetDate', () => {
      const result = updateSavingGoalSchema.safeParse({
        goalType: 'contribution',
        targetDate: '2026-12-31T00:00:00.000Z',
      })
      expect(result.success).toBe(false)
    })

    it('rejects a negative contributionAmount in an update', () => {
      const result = updateSavingGoalSchema.safeParse({ contributionAmount: -1 })
      expect(result.success).toBe(false)
    })

    it('accepts an allocatedAmount patch on a contribution goal', () => {
      const result = updateSavingGoalSchema.safeParse({ allocatedAmount: 300 })
      expect(result.success).toBe(true)
    })
  })
})
