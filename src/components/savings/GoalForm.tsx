import type { UseFormReturn } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DatePicker } from '@/components/transactions/DatePicker'
import type { Wallet } from '../../../shared/schemas/wallet.schema'
import type { CreateSavingGoal } from '../../../shared/schemas/saving-goal.schema'

type GoalFormValues = CreateSavingGoal & { targetDate?: string }

interface GoalFormProps {
  form: UseFormReturn<GoalFormValues>
  isSubmitting: boolean
  savingsWallets: Wallet[]
  isEditMode: boolean
}

export function GoalForm({ form, isSubmitting, savingsWallets, isEditMode }: GoalFormProps) {
  return (
    <>
      {!isEditMode && (
        <div className="space-y-2">
          <Label htmlFor="walletId">Wallet</Label>
          <Select
            value={form.watch('walletId') as string || ''}
            onValueChange={(value) => form.setValue('walletId', value)}
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

      <div className="space-y-2">
        <Label htmlFor="name">Goal Name</Label>
        <Input
          id="name"
          {...form.register('name')}
          placeholder="e.g., New Camera"
          disabled={isSubmitting}
        />
        {form.formState.errors.name && (
          <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
        )}
      </div>

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
      </div>
    </>
  )
}
