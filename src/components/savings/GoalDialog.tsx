import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { GoalForm } from './GoalForm'
import { savingGoalService } from '@/services/savingGoalService'
import type { SavingGoal, CreateSavingGoal, UpdateSavingGoal } from '../../../shared/schemas/saving-goal.schema'
import { createSavingGoalSchema, updateSavingGoalSchema } from '../../../shared/schemas/saving-goal.schema'
import type { Wallet } from '../../../shared/schemas/wallet.schema'

interface GoalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  goal?: SavingGoal | null
  savingsWallets: Wallet[]
}

export function GoalDialog({ open, onOpenChange, goal, savingsWallets }: GoalDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditMode = !!goal

  const schema = isEditMode ? updateSavingGoalSchema : createSavingGoalSchema
  const form = useForm<CreateSavingGoal>({
    // @ts-expect-error zodResolver union type mismatch between create/update schemas
    resolver: zodResolver(schema),
    defaultValues: {
      walletId: savingsWallets[0]?._id || '',
      name: '',
      targetAmount: 0,
    },
  })

  useEffect(() => {
    if (goal) {
      form.reset({
        name: goal.name,
        targetAmount: goal.targetAmount,
      })
    } else {
      form.reset({
        walletId: savingsWallets[0]?._id || '',
        name: '',
        targetAmount: 0,
      })
    }
  }, [goal, form, savingsWallets])

  const onSubmit = async (data: CreateSavingGoal) => {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Goal' : 'Create New Goal'}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Update your savings goal details.'
              : 'Add a new savings goal to track your progress.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <GoalForm
            form={form}
            isSubmitting={isSubmitting}
            savingsWallets={savingsWallets}
            isEditMode={isEditMode}
          />

          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
