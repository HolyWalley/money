import { z } from 'zod'

export const goalTypeSchema = z.enum(['target', 'contribution'])
export const contributionPeriodTypeSchema = z.enum(['weekly', 'monthly', 'yearly'])

const savingGoalObject = z.object({
  _id: z.string(),
  walletId: z.string().min(1, 'Wallet is required'),
  name: z.string().min(1, 'Goal name is required').max(100, 'Goal name is too long'),
  goalType: goalTypeSchema.default('target'),
  targetAmount: z.number().positive('Target amount must be positive').optional(),
  contributionAmount: z.number().positive('Contribution amount must be positive').optional(),
  contributionPeriodType: contributionPeriodTypeSchema.optional(),
  contributionMonthDay: z.number().int().min(1).max(31).optional(),
  contributionWeekDay: z.number().int().min(0).max(6).optional(),
  contributionYearDay: z.number().int().min(1).max(366).optional(),
  allocatedAmount: z.number().min(0).default(0),
  achieved: z.boolean().default(false),
  order: z.number().default(0),
  targetDate: z.string().datetime().optional(),
  sourceRecurringPaymentId: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

interface GoalShapeForRefine {
  goalType?: 'target' | 'contribution'
  targetAmount?: number
  targetDate?: string
  contributionAmount?: number
  contributionPeriodType?: 'weekly' | 'monthly' | 'yearly'
  contributionMonthDay?: number
  contributionWeekDay?: number
  contributionYearDay?: number
}

const contributionFieldNames = [
  'contributionAmount',
  'contributionPeriodType',
  'contributionMonthDay',
  'contributionWeekDay',
  'contributionYearDay',
] as const

const anchorFieldByPeriodType = {
  weekly: 'contributionWeekDay',
  monthly: 'contributionMonthDay',
  yearly: 'contributionYearDay',
} as const

function addIssue(ctx: z.RefinementCtx, path: string, message: string) {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message })
}

function refineGoalShape(data: GoalShapeForRefine, ctx: z.RefinementCtx, partial: boolean) {
  if (data.goalType === 'target') {
    if (!partial && data.targetAmount === undefined) {
      addIssue(ctx, 'targetAmount', 'Target amount is required')
    }
    for (const field of contributionFieldNames) {
      if (data[field] !== undefined) {
        addIssue(ctx, field, 'Contribution fields are not allowed on a target goal')
      }
    }
  }

  if (data.goalType === 'contribution') {
    if (!partial && data.contributionAmount === undefined) {
      addIssue(ctx, 'contributionAmount', 'Contribution amount is required')
    }
    if (!partial && data.contributionPeriodType === undefined) {
      addIssue(ctx, 'contributionPeriodType', 'Contribution period is required')
    }
    if (data.targetAmount !== undefined) {
      addIssue(ctx, 'targetAmount', 'Target amount is not allowed on a contribution goal')
    }
    if (data.targetDate !== undefined) {
      addIssue(ctx, 'targetDate', 'Deadline is not allowed on a contribution goal')
    }
  }

  if (data.contributionPeriodType) {
    const allowed = anchorFieldByPeriodType[data.contributionPeriodType]
    for (const field of ['contributionMonthDay', 'contributionWeekDay', 'contributionYearDay'] as const) {
      if (field !== allowed && data[field] !== undefined) {
        addIssue(ctx, field, `Anchor day does not match the ${data.contributionPeriodType} period`)
      }
    }
  }
}

export const savingGoalSchema = savingGoalObject.superRefine((data, ctx) => refineGoalShape(data, ctx, false))

export const createSavingGoalSchema = savingGoalObject.pick({
  walletId: true,
  name: true,
  goalType: true,
  targetAmount: true,
  contributionAmount: true,
  contributionPeriodType: true,
  contributionMonthDay: true,
  contributionWeekDay: true,
  contributionYearDay: true,
  targetDate: true,
  sourceRecurringPaymentId: true,
}).superRefine((data, ctx) => refineGoalShape(data, ctx, false))

export const updateSavingGoalSchema = savingGoalObject.pick({
  walletId: true,
  name: true,
  goalType: true,
  targetAmount: true,
  contributionAmount: true,
  contributionPeriodType: true,
  contributionMonthDay: true,
  contributionWeekDay: true,
  contributionYearDay: true,
  allocatedAmount: true,
  achieved: true,
  order: true,
  targetDate: true,
  sourceRecurringPaymentId: true,
}).partial().superRefine((data, ctx) => refineGoalShape(data, ctx, true))

export type GoalType = z.infer<typeof goalTypeSchema>
export type ContributionPeriodType = z.infer<typeof contributionPeriodTypeSchema>
export type SavingGoal = z.infer<typeof savingGoalSchema>
export type CreateSavingGoal = z.infer<typeof createSavingGoalSchema>
export type UpdateSavingGoal = z.infer<typeof updateSavingGoalSchema>
