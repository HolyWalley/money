import { z } from 'zod'
import { CurrencyEnum } from './user_settings.schema'
import { transactionTypeSchema } from './transaction.schema'

export const recurringPaymentSchema = z.object({
  _id: z.string(),
  amount: z.number().positive('Amount must be positive'),
  currency: CurrencyEnum,
  categoryId: z.string(),
  walletId: z.string(),
  toWalletId: z.string().optional(),
  transactionType: transactionTypeSchema,
  description: z.string().max(200, 'Description is too long').optional(),
  rrule: z.string().min(1, 'RRULE is required'),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  isActive: z.boolean(),
  sourceTransactionId: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const createRecurringPaymentSchema = recurringPaymentSchema.pick({
  amount: true,
  currency: true,
  categoryId: true,
  walletId: true,
  toWalletId: true,
  transactionType: true,
  description: true,
  rrule: true,
  startDate: true,
  endDate: true,
  sourceTransactionId: true,
})

export const updateRecurringPaymentSchema = recurringPaymentSchema.pick({
  amount: true,
  currency: true,
  categoryId: true,
  walletId: true,
  toWalletId: true,
  transactionType: true,
  description: true,
  rrule: true,
  startDate: true,
  endDate: true,
  isActive: true,
}).partial()

export const recurringPaymentLogStatusSchema = z.enum(['logged', 'skipped'])

export const recurringPaymentLogSchema = z.object({
  _id: z.string(),
  recurringPaymentId: z.string(),
  scheduledDate: z.string().datetime(),
  status: recurringPaymentLogStatusSchema,
  transactionId: z.string().optional(),
  createdAt: z.string().datetime(),
})

export type RecurringPayment = z.infer<typeof recurringPaymentSchema>
export type CreateRecurringPayment = z.infer<typeof createRecurringPaymentSchema>
export type UpdateRecurringPayment = z.infer<typeof updateRecurringPaymentSchema>
export type RecurringPaymentLogStatus = z.infer<typeof recurringPaymentLogStatusSchema>
export type RecurringPaymentLog = z.infer<typeof recurringPaymentLogSchema>
