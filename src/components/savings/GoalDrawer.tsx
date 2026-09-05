import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import type { Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { GoalForm } from './GoalForm'
import type { GoalFormValues } from './GoalForm'
import { savingGoalService } from '@/services/savingGoalService'
import type { SavingGoal, CreateSavingGoal, UpdateSavingGoal } from '../../../shared/schemas/saving-goal.schema'
import { createSavingGoalSchema, updateSavingGoalSchema } from '../../../shared/schemas/saving-goal.schema'
import type { Wallet } from '../../../shared/schemas/wallet.schema'

interface GoalDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  goal?: SavingGoal | null
  savingsWallets: Wallet[]
}

function emptyGoalValues(walletId: string): GoalFormValues {
  return {
    walletId,
    name: '',
    goalType: 'target',
    targetAmount: 0,
    targetDate: undefined,
    contributionAmount: undefined,
    contributionPeriodType: undefined,
    contributionMonthDay: undefined,
    contributionWeekDay: undefined,
    contributionYearDay: undefined,
  }
}

// Only the fields the goal's own type allows are loaded back: a stored record
// that still carries a field from the other shape would otherwise fail
// validation on every submit and leave the Update button doing nothing.
function goalToFormValues(goal: SavingGoal): Partial<GoalFormValues> {
  const goalType = goal.goalType ?? 'target'
  const isContribution = goalType === 'contribution'
  const cadence = isContribution ? goal.contributionPeriodType : undefined

  return {
    name: goal.name,
    goalType,
    targetAmount: isContribution ? undefined : goal.targetAmount,
    targetDate: isContribution ? undefined : goal.targetDate,
    contributionAmount: isContribution ? goal.contributionAmount : undefined,
    contributionPeriodType: cadence,
    contributionMonthDay: cadence === 'monthly' ? goal.contributionMonthDay : undefined,
    contributionWeekDay: cadence === 'weekly' ? goal.contributionWeekDay : undefined,
    contributionYearDay: cadence === 'yearly' ? goal.contributionYearDay : undefined,
  }
}

export function GoalDrawer({ open, onOpenChange, goal, savingsWallets }: GoalDrawerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditMode = !!goal
  const isLinkedToRecurring = !!goal?.sourceRecurringPaymentId

  const schema = isEditMode ? updateSavingGoalSchema : createSavingGoalSchema
  const form = useForm<GoalFormValues>({
    resolver: zodResolver(schema as typeof createSavingGoalSchema) as unknown as Resolver<GoalFormValues>,
    defaultValues: emptyGoalValues(savingsWallets[0]?._id || ''),
  })

  useEffect(() => {
    if (goal) {
      form.reset(goalToFormValues(goal))
    } else {
      form.reset(emptyGoalValues(savingsWallets[0]?._id || ''))
    }
  }, [goal, form, savingsWallets])

  const onSubmit = async (data: GoalFormValues) => {
    setIsSubmitting(true)
    setError(null)

    try {
      if (isEditMode && goal) {
        await savingGoalService.updateGoal(goal._id, data as UpdateSavingGoal)
      } else {
        await savingGoalService.createGoal(data as CreateSavingGoal)
      }
      onOpenChange(false)
      form.reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Without this the submit button is a silent no-op whenever the resolver
  // rejects a field the form has no error slot for.
  const onInvalid = () => {
    setError('Some fields are invalid. Please review the form and try again.')
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="[--drawer-inset:0.5rem] [--bleed:0px] rounded-xl">
        <div className="mx-auto w-full">
          <DrawerHeader>
            <DrawerTitle>{isEditMode ? 'Edit Goal' : 'New Goal'}</DrawerTitle>
            <DrawerDescription>
              {isEditMode
                ? 'Update your savings goal details.'
                : 'Add a new savings goal to track your progress.'}
            </DrawerDescription>
          </DrawerHeader>
          <form
            onSubmit={form.handleSubmit(onSubmit, onInvalid)}
            className="px-4 max-h-[50vh] overflow-y-auto group-data-[swipe-direction=right]/drawer-popup:max-h-[calc(100dvh-14rem)]"
          >
            <div className="space-y-4 pb-6">
              <GoalForm
                form={form}
                isSubmitting={isSubmitting}
                savingsWallets={savingsWallets}
                isEditMode={isEditMode}
                isLinkedToRecurring={isLinkedToRecurring}
              />

              {error && (
                <div className="text-sm text-destructive">{error}</div>
              )}
            </div>
          </form>
          <DrawerFooter>
            <Button
              type="submit"
              size="lg"
              onClick={form.handleSubmit(onSubmit, onInvalid)}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
