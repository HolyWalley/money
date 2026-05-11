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
})
