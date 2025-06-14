import type { UseFormReturn } from 'react-hook-form'
import type { CreateTransaction } from '../../../shared/schemas/transaction.schema'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

interface TransactionTypeSwitchProps {
  form: UseFormReturn<CreateTransaction>
  isSubmitting: boolean;
}

export function TransactionTypeSwitch({ form, isSubmitting }: TransactionTypeSwitchProps) {
  return (
    <div className="space-y-2">
      <ToggleGroup
        type="single"
        value={form.watch('transactionType')}
        onValueChange={(value) => {
          if (value) {
            form.setValue('transactionType', value as 'income' | 'expense' | 'transfer')
            // Clear category/wallet fields when switching types
            if (value === 'transfer') {
              form.setValue('categoryId', undefined)
            } else {
              form.setValue('toWalletId', undefined)
            }
          }
        }}
        disabled={isSubmitting}
        className="w-full gap-2 bg-transparent p-0"
        size="sm"
      >
        <ToggleGroupItem
          value="expense"
          aria-label="Expense"
          className="flex-1 !rounded-full uppercase text-xs transition-colors data-[state=on]:bg-primary data-[state=on]:text-primary-foreground hover:bg-muted hover:text-foreground"
        >
          Expense
        </ToggleGroupItem>
        <ToggleGroupItem
          value="income"
          aria-label="Income"
          className="flex-1 !rounded-full uppercase text-xs transition-colors data-[state=on]:bg-primary data-[state=on]:text-primary-foreground hover:bg-muted hover:text-foreground"
        >
          Income
        </ToggleGroupItem>
        <ToggleGroupItem
          value="transfer"
          aria-label="Transfer"
          className="flex-1 !rounded-full uppercase text-xs transition-colors data-[state=on]:bg-primary data-[state=on]:text-primary-foreground hover:bg-muted hover:text-foreground"
        >
          Transfer
        </ToggleGroupItem>
      </ToggleGroup>
      {form.formState.errors.transactionType && (
        <p className="text-sm text-destructive">{form.formState.errors.transactionType.message}</p>
      )}
    </div>
  )
}
