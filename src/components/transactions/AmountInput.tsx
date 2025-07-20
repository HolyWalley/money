import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFormContext } from 'react-hook-form'
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form'
import type { CreateTransaction } from '../../../shared/schemas/transaction.schema'
import { currencies } from '../../../shared/schemas/user_settings.schema'
import { MoneyInput } from './MoneyInput'

interface AmountInputProps {
  isSubmitting: boolean
  size: 'sm' | 'full'
  variant?: 'from' | 'to'
  currency?: string
  autoFill?: boolean
}

export function AmountInput({ isSubmitting, size = 'full', variant = 'from', currency: overrideCurrency, autoFill = false }: AmountInputProps) {
  const form = useFormContext<CreateTransaction>()
  const fieldName: keyof CreateTransaction = variant === 'from' ? 'amount' : 'toAmount'
  const currencyFieldName: keyof CreateTransaction = variant === 'from' ? 'currency' : 'toCurrency'
  const amount = form.watch(fieldName) as number | undefined
  const fromAmount = form.watch('amount')
  const currency = overrideCurrency || form.watch(currencyFieldName) as string

  // Set currency when overrideCurrency is provided
  useEffect(() => {
    if (overrideCurrency) {
      const fieldName: keyof CreateTransaction = variant === 'to' ? 'toCurrency' : 'currency'
      const currentValue = form.getValues(fieldName)
      if (currentValue !== overrideCurrency) {
        form.setValue(fieldName, overrideCurrency as typeof currencies[number])
      }
    }
  }, [overrideCurrency, variant, form])

  const handleAmountChange = (newAmount: number) => {
    if (variant === 'from') {
      form.setValue('amount', newAmount)
      if (autoFill) {
        form.setValue('toAmount', newAmount)
      }
    } else {
      form.setValue('toAmount', newAmount)
    }
  }

  return (
    <FormField
      control={form.control}
      name={fieldName}
      render={() => (
        <FormItem className="space-y-2 flex-1">
          <FormControl>
            <div
              className={cn(
                "bg-muted/50 rounded-lg p-2",
                autoFill && variant === 'to' ? "opacity-60" : "cursor-text"
              )}
            >
              <label className="flex items-center justify-center gap-3">
                <MoneyInput
                  className={
                    cn(
                      "text-3xl font-bold",
                      { "max-w-[3ch]": size === 'sm' },
                    )
                  }
                  defaultValue={amount}
                  onChange={handleAmountChange}
                  disabled={isSubmitting || (autoFill && variant === 'to')}
                  overrideValue={autoFill ? fromAmount : undefined}
                />

                {overrideCurrency ? (
                  <span className="text-3xl font-bold">{currency}</span>
                ) : (
                  <FormField
                    control={form.control}
                    name={currencyFieldName}
                    render={({ field: currencyField }) => (
                      <Select
                        value={currencyField.value as string}
                        onValueChange={currencyField.onChange}
                        disabled={isSubmitting || (autoFill && variant === 'to')}
                      >
                        <SelectTrigger
                          className="w-auto border-0 !bg-transparent hover:!bg-transparent dark:!bg-transparent dark:hover:!bg-transparent text-3xl font-bold p-0 h-auto focus:ring-0 focus:ring-offset-0 [&>svg]:hidden shadow-none"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {currencies.map((curr) => (
                            <SelectItem key={curr} value={curr}>
                              {curr}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                )}
              </label>
            </div>
          </FormControl>
          <FormMessage className="text-center" />
        </FormItem>
      )}
    />
  )
}
