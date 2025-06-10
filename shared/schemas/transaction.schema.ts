import { z } from 'zod'
import { CurrencyEnum } from './user_settings.schema'

export const transactionTypeSchema = z.enum(['income', 'expense', 'transfer'])

export const transactionSchema = z.object({
  _id: z.string(),
  _rev: z.string().optional(),
  type: z.literal('transaction'),
  userId: z.string(),
  transactionType: transactionTypeSchema,
  amount: z.number().positive('Amount must be positive'),
  currency: CurrencyEnum,
  note: z.string().max(200, 'Note is too long').optional(),
  categoryId: z.string().optional(),
  walletId: z.string(),
  toWalletId: z.string().optional(),
  date: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const createTransactionSchema = transactionSchema.pick({
  transactionType: true,
  amount: true,
  currency: true,
  note: true,
  categoryId: true,
  walletId: true,
  toWalletId: true,
  date: true,
}).refine((data) => {
  if (data.transactionType === 'transfer') {
    return data.toWalletId !== undefined && data.toWalletId !== data.walletId
  }
  if (data.transactionType === 'income' || data.transactionType === 'expense') {
    return data.categoryId !== undefined
  }
  return true
}, {
  message: 'Transfer transactions require toWalletId, income/expense transactions require categoryId',
})

export const updateTransactionSchema = transactionSchema.pick({
  transactionType: true,
  amount: true,
  currency: true,
  note: true,
  categoryId: true,
  walletId: true,
  toWalletId: true,
  date: true,
}).partial().refine((data) => {
  if (data.transactionType === 'transfer') {
    return data.toWalletId !== undefined && data.toWalletId !== data.walletId
  }
  if (data.transactionType === 'income' || data.transactionType === 'expense') {
    return data.categoryId !== undefined
  }
  return true
}, {
  message: 'Transfer transactions require toWalletId, income/expense transactions require categoryId',
})

export type TransactionType = z.infer<typeof transactionTypeSchema>
export type Transaction = z.infer<typeof transactionSchema>
export type CreateTransaction = z.infer<typeof createTransactionSchema>
export type UpdateTransaction = z.infer<typeof updateTransactionSchema>
