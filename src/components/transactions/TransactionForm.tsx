import type { UseFormReturn } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CreateTransaction } from '../../../shared/schemas/transaction.schema'
import { AmountInput } from './AmountInput'
import { TransactionTypeSwitch } from './TransactionTypeSwitch'
import { DatePicker } from './DatePicker'
import { CategoriesPicker } from './CategoryPicker'
import { FromWalletSelector } from './FromWalletSelector'
import { ToWalletSelector } from './ToWalletSelector'

interface TransactionFormProps {
  form: UseFormReturn<CreateTransaction>
  isSubmitting: boolean
}

export function TransactionForm({ form, isSubmitting }: TransactionFormProps) {
  const transactionType = form.watch('transactionType')

  return (
    <>
      <TransactionTypeSwitch form={form} isSubmitting={isSubmitting} />
      <AmountInput form={form} isSubmitting={isSubmitting} />

      {(transactionType === 'income' || transactionType === 'expense') && (
        <CategoriesPicker form={form} isSubmitting={isSubmitting} />
      )}

      <FromWalletSelector form={form} isSubmitting={isSubmitting} />

      {transactionType === 'transfer' && (
        <ToWalletSelector form={form} isSubmitting={isSubmitting} />
      )}

      <div className="space-y-2">
        <Label>Date</Label>
        <DatePicker
          value={(() => {
            try {
              const dateValue = form.watch('date')
              return dateValue ? new Date(dateValue) : new Date()
            } catch {
              return new Date()
            }
          })()}
          onChange={(date) => {
            form.setValue('date', date.toISOString())
          }}
          disabled={isSubmitting}
          className="w-full"
        />
        {form.formState.errors.date && (
          <p className="text-sm text-destructive">{form.formState.errors.date.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">Note</Label>
        <Input
          id="note"
          {...form.register('note')}
          placeholder="e.g., Grocery shopping, Salary, Coffee"
          disabled={isSubmitting}
          className="w-full"
        />
        {form.formState.errors.note && (
          <p className="text-sm text-destructive">{form.formState.errors.note.message}</p>
        )}
      </div>
    </>
  )
}
