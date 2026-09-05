import type { UseFormReturn } from 'react-hook-form'
import { RotateCw } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatWalletName } from '@/lib/wallet-utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DatePicker } from '@/components/transactions/DatePicker'
import type { Wallet } from '../../../shared/schemas/wallet.schema'
import type {
  ContributionPeriodType,
  CreateSavingGoal,
  GoalType,
} from '../../../shared/schemas/saving-goal.schema'

export type GoalFormValues = CreateSavingGoal & { targetDate?: string }

const GOAL_TYPES: { value: GoalType; label: string }[] = [
  { value: 'target', label: 'Target amount' },
  { value: 'contribution', label: 'Recurring contribution' },
]

const CONTRIBUTION_PERIOD_TYPES: { value: ContributionPeriodType; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]

const WEEK_DAYS = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '0', label: 'Sunday' },
]

const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => ({
  value: (i + 1).toString(),
  label: `Day ${i + 1}`,
}))

const YEAR_DAYS = Array.from({ length: 365 }, (_, i) => ({
  value: (i + 1).toString(),
  label: `Day ${i + 1}`,
}))

interface GoalFormProps {
  form: UseFormReturn<GoalFormValues>
  isSubmitting: boolean
  savingsWallets: Wallet[]
  isEditMode: boolean
  isLinkedToRecurring: boolean
}

export function GoalForm({ form, isSubmitting, savingsWallets, isEditMode, isLinkedToRecurring }: GoalFormProps) {
  const goalType: GoalType = form.watch('goalType') ?? 'target'
  const contributionPeriodType = form.watch('contributionPeriodType')

  const handleGoalTypeChange = (value: GoalType) => {
    form.setValue('goalType', value, { shouldDirty: true })

    if (value === 'contribution') {
      form.setValue('targetAmount', undefined)
      form.setValue('targetDate', undefined)
      form.setValue('contributionPeriodType', 'monthly')
      form.setValue('contributionMonthDay', 1)
      form.setValue('contributionWeekDay', undefined)
      form.setValue('contributionYearDay', undefined)
    } else {
      form.setValue('targetAmount', 0)
      form.setValue('contributionAmount', undefined)
      form.setValue('contributionPeriodType', undefined)
      form.setValue('contributionMonthDay', undefined)
      form.setValue('contributionWeekDay', undefined)
      form.setValue('contributionYearDay', undefined)
    }

    form.clearErrors()
  }

  const handleContributionPeriodTypeChange = (value: ContributionPeriodType) => {
    form.setValue('contributionPeriodType', value, { shouldDirty: true })
    form.setValue('contributionMonthDay', value === 'monthly' ? 1 : undefined)
    form.setValue('contributionWeekDay', value === 'weekly' ? 1 : undefined)
    form.setValue('contributionYearDay', value === 'yearly' ? 1 : undefined)
  }

  return (
    <>
      {!isEditMode && (
        <div className="space-y-2">
          <Label htmlFor="walletId">Wallet</Label>
          <Select
            items={savingsWallets.map(wallet => ({ value: wallet._id, label: formatWalletName(wallet) }))}
            value={form.watch('walletId') as string || ''}
            onValueChange={(value) => value && form.setValue('walletId', value)}
            disabled={isSubmitting}
          >
            <SelectTrigger id="walletId">
              <SelectValue placeholder="Select a savings wallet" />
            </SelectTrigger>
            <SelectContent>
              {savingsWallets.map((wallet) => (
                <SelectItem key={wallet._id} value={wallet._id}>
                  {wallet.name} ({wallet.currency})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {'walletId' in form.formState.errors && form.formState.errors.walletId && (
            <p className="text-sm text-destructive">{form.formState.errors.walletId.message}</p>
          )}
        </div>
      )}

      {!isEditMode && (
        <div className="space-y-2">
          <Label htmlFor="goalType">Goal Type</Label>
          <Select
            items={GOAL_TYPES}
            value={goalType}
            onValueChange={(value) => value && handleGoalTypeChange(value as GoalType)}
            disabled={isSubmitting}
          >
            <SelectTrigger id="goalType">
              <SelectValue placeholder="Select a goal type" />
            </SelectTrigger>
            <SelectContent className="w-auto">
              {GOAL_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {goalType === 'contribution'
              ? 'Put a fixed amount aside every period. No target, no deadline.'
              : 'Save towards a fixed amount, optionally by a deadline.'}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Goal Name</Label>
        <Input
          id="name"
          {...form.register('name')}
          placeholder={goalType === 'contribution' ? 'e.g., Travel' : 'e.g., New Camera'}
          disabled={isSubmitting}
        />
        {form.formState.errors.name && (
          <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
        )}
      </div>

      {goalType === 'contribution' ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="contributionAmount">Contribution Amount</Label>
            <Input
              id="contributionAmount"
              type="number"
              step="0.01"
              {...form.register('contributionAmount', { valueAsNumber: true })}
              placeholder="0.00"
              disabled={isSubmitting}
            />
            {'contributionAmount' in form.formState.errors && form.formState.errors.contributionAmount && (
              <p className="text-sm text-destructive">{form.formState.errors.contributionAmount.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contributionPeriodType">Repeats</Label>
            <Select
              items={CONTRIBUTION_PERIOD_TYPES}
              value={contributionPeriodType ?? 'monthly'}
              onValueChange={(value) => value && handleContributionPeriodTypeChange(value as ContributionPeriodType)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="contributionPeriodType">
                <SelectValue placeholder="Select a period" />
              </SelectTrigger>
              <SelectContent>
                {CONTRIBUTION_PERIOD_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {'contributionPeriodType' in form.formState.errors && form.formState.errors.contributionPeriodType && (
              <p className="text-sm text-destructive">{form.formState.errors.contributionPeriodType.message}</p>
            )}
          </div>

          {contributionPeriodType === 'weekly' && (
            <div className="space-y-2">
              <Label htmlFor="contributionWeekDay">Week Start Day</Label>
              <Select
                items={WEEK_DAYS}
                value={(form.watch('contributionWeekDay') ?? 1).toString()}
                onValueChange={(value) => value && form.setValue('contributionWeekDay', parseInt(value), { shouldDirty: true })}
                disabled={isSubmitting}
              >
                <SelectTrigger id="contributionWeekDay">
                  <SelectValue placeholder="Select day" />
                </SelectTrigger>
                <SelectContent>
                  {WEEK_DAYS.map((day) => (
                    <SelectItem key={day.value} value={day.value}>
                      {day.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {contributionPeriodType === 'monthly' && (
            <div className="space-y-2">
              <Label htmlFor="contributionMonthDay">Month Start Day</Label>
              <Select
                items={MONTH_DAYS}
                value={(form.watch('contributionMonthDay') ?? 1).toString()}
                onValueChange={(value) => value && form.setValue('contributionMonthDay', parseInt(value), { shouldDirty: true })}
                disabled={isSubmitting}
              >
                <SelectTrigger id="contributionMonthDay">
                  <SelectValue placeholder="Select day" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {MONTH_DAYS.map((day) => (
                    <SelectItem key={day.value} value={day.value}>
                      {day.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {contributionPeriodType === 'yearly' && (
            <div className="space-y-2">
              <Label htmlFor="contributionYearDay">Year Start Day</Label>
              <Select
                items={YEAR_DAYS}
                value={(form.watch('contributionYearDay') ?? 1).toString()}
                onValueChange={(value) => value && form.setValue('contributionYearDay', parseInt(value), { shouldDirty: true })}
                disabled={isSubmitting}
              >
                <SelectTrigger id="contributionYearDay">
                  <SelectValue placeholder="Select day" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {YEAR_DAYS.map((day) => (
                    <SelectItem key={day.value} value={day.value}>
                      {day.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="targetAmount">Target Amount</Label>
            <Input
              id="targetAmount"
              type="number"
              step="0.01"
              {...form.register('targetAmount', { valueAsNumber: true })}
              placeholder="0.00"
              disabled={isSubmitting}
            />
            {'targetAmount' in form.formState.errors && form.formState.errors.targetAmount && (
              <p className="text-sm text-destructive">{form.formState.errors.targetAmount.message}</p>
            )}
          </div>

          <div className="space-y-2">
            {isLinkedToRecurring ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <RotateCw className="size-3" />
                Deadline is managed by the linked recurring payment.
              </p>
            ) : (
              <>
                <Label htmlFor="targetDate">Deadline (optional)</Label>
                <DatePicker
                  value={form.watch('targetDate') ? new Date(form.watch('targetDate')!) : undefined}
                  onChange={(date) => form.setValue('targetDate', date ? date.toISOString() : undefined, { shouldDirty: true })}
                  disabled={isSubmitting}
                  clearable
                  placeholder="No deadline"
                />
                {'targetDate' in form.formState.errors && form.formState.errors.targetDate && (
                  <p className="text-sm text-destructive">{form.formState.errors.targetDate.message}</p>
                )}
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}
