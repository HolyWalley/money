import { z } from 'zod'

export const savingGoalSchema = z.object({
  _id: z.string(),
  walletId: z.string().min(1, 'Wallet is required'),
  name: z.string().min(1, 'Goal name is required').max(100, 'Goal name is too long'),
  targetAmount: z.number().positive('Target amount must be positive'),
  allocatedAmount: z.number().min(0).default(0),
  achieved: z.boolean().default(false),
  order: z.number().default(0),
  targetDate: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const createSavingGoalSchema = savingGoalSchema.pick({
  walletId: true,
  name: true,
  targetAmount: true,
  targetDate: true,
})

export const updateSavingGoalSchema = savingGoalSchema.pick({
  name: true,
  targetAmount: true,
  allocatedAmount: true,
  achieved: true,
  order: true,
  targetDate: true,
}).partial()

export type SavingGoal = z.infer<typeof savingGoalSchema>
export type CreateSavingGoal = z.infer<typeof createSavingGoalSchema>
export type UpdateSavingGoal = z.infer<typeof updateSavingGoalSchema>
