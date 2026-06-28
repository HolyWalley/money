import { describe, it, expect } from 'vitest'
import {
  recurringPaymentSchema,
  createRecurringPaymentSchema,
  updateRecurringPaymentSchema,
} from './recurring-payment.schema'

describe('recurring-payment.schema', () => {
  const baseRecurringPayment = {
    _id: 'rp-1',
    amount: 100,
    currency: 'USD',
    categoryId: 'cat-1',
    walletId: 'wallet-1',
    transactionType: 'expense' as const,
    rrule: 'FREQ=MONTHLY',
    startDate: '2026-01-01T00:00:00.000Z',
    isActive: true,
    sourceTransactionId: 'tx-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }

  describe('recurringPaymentSchema', () => {
    it('parses without savingsWalletId', () => {
      const result = recurringPaymentSchema.safeParse(baseRecurringPayment)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.savingsWalletId).toBeUndefined()
      }
    })

    it('parses with an optional savingsWalletId', () => {
      const result = recurringPaymentSchema.safeParse({
        ...baseRecurringPayment,
        savingsWalletId: 'savings-wallet-1',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.savingsWalletId).toBe('savings-wallet-1')
      }
    })

    it('rejects a non-string savingsWalletId', () => {
      const result = recurringPaymentSchema.safeParse({
        ...baseRecurringPayment,
        savingsWalletId: 123,
      })
      expect(result.success).toBe(false)
    })

  })

  describe('createRecurringPaymentSchema', () => {
    const baseCreate = {
      amount: 100,
      currency: 'USD',
      categoryId: 'cat-1',
      walletId: 'wallet-1',
      transactionType: 'expense' as const,
      rrule: 'FREQ=MONTHLY',
      startDate: '2026-01-01T00:00:00.000Z',
      sourceTransactionId: 'tx-1',
    }

    it('accepts savingsWalletId on create', () => {
      const result = createRecurringPaymentSchema.safeParse({
        ...baseCreate,
        savingsWalletId: 'savings-wallet-1',
      })
      expect(result.success).toBe(true)
    })

    it('accepts the absence of savingsWalletId on create', () => {
      const result = createRecurringPaymentSchema.safeParse(baseCreate)
      expect(result.success).toBe(true)
    })

  })

  describe('updateRecurringPaymentSchema', () => {
    it('validates a partial update containing only savingsWalletId', () => {
      const result = updateRecurringPaymentSchema.safeParse({
        savingsWalletId: 'savings-wallet-1',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.savingsWalletId).toBe('savings-wallet-1')
      }
    })

    it('rejects a non-string savingsWalletId in update', () => {
      const result = updateRecurringPaymentSchema.safeParse({
        savingsWalletId: 42,
      })
      expect(result.success).toBe(false)
    })

  })
})
