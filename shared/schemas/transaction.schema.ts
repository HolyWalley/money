import { z } from 'zod'
import { CurrencyEnum } from './user_settings.schema'

export const transactionTypeSchema = z.enum(['income', 'expense', 'transfer'])

export const transactionSchema = z.object({
  _id: z.string(),
  _rev: z.string().optional(),
  type: z.literal('transaction'),
  transactionType: transactionTypeSchema,
  amount: z.number().positive('Amount must be positive'),
  currency: CurrencyEnum,
  toAmount: z.number().positive('Amount must be positive').optional(),
  toCurrency: CurrencyEnum.optional(),
  note: z.string().max(200, 'Note is too long').optional(),
  categoryId: z.string(),
  walletId: z.string(),
  toWalletId: z.string().optional(),
  date: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  split: z.boolean().default(false).optional(),
  parts: z.array(z.object({
    amount: z.number().gte(0, 'Part amount can not be negative'),
  })).optional(),
  reimbursement: z.boolean().default(false).optional(),
})

export const createTransactionSchema = transactionSchema.pick({
  transactionType: true,
  amount: true,
  currency: true,
  toAmount: true,
  toCurrency: true,
  note: true,
  categoryId: true,
  walletId: true,
  toWalletId: true,
  date: true,
  split: true,
  parts: true,
  reimbursement: true
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
}).refine((data) => {
  if (data.transactionType === 'transfer' && data.toAmount !== undefined) {
    return data.toCurrency !== undefined
  }
  return true
}, {
  message: 'Transfer transactions with toAmount require toCurrency',
})

export const updateTransactionSchema = transactionSchema.pick({
  transactionType: true,
  amount: true,
  currency: true,
  toAmount: true,
  toCurrency: true,
  note: true,
  categoryId: true,
  walletId: true,
  toWalletId: true,
  date: true,
  split: true,
  parts: true,
  reimbursement: true
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
}).refine((data) => {
  if (data.transactionType === 'transfer' && data.toAmount !== undefined) {
    return data.toCurrency !== undefined
  }
  return true
}, {
  message: 'Transfer transactions with toAmount require toCurrency',
})

export type TransactionType = z.infer<typeof transactionTypeSchema>
export type Transaction = z.infer<typeof transactionSchema>
export type CreateTransaction = z.infer<typeof createTransactionSchema>
export type UpdateTransaction = z.infer<typeof updateTransactionSchema>
