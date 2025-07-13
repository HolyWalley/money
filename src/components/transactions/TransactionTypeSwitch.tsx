import { useFormContext } from 'react-hook-form'
import type { CreateTransaction } from '../../../shared/schemas/transaction.schema'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form'

interface TransactionTypeSwitchProps {
  isSubmitting: boolean;
}

export function TransactionTypeSwitch({ isSubmitting }: TransactionTypeSwitchProps) {
  const form = useFormContext<CreateTransaction>()
  
  return (
    <FormField
      control={form.control}
      name="transactionType"
      render={({ field }) => (
        <FormItem>
          <FormControl>
            <ToggleGroup
              type="single"
              value={field.value}
              onValueChange={(value) => {
                if (value) {
                  field.onChange(value)
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
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
