import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { UseFormReturn } from 'react-hook-form'
import type { CreateTransaction } from '../../../shared/schemas/transaction.schema'
import { currencies } from '../../../shared/schemas/user_settings.schema'

interface AmountInputProps {
  form: UseFormReturn<CreateTransaction>
  isSubmitting: boolean
  variant?: 'from' | 'to'
  currency?: string
  autoFill?: boolean
}

export function AmountInput({ form, isSubmitting, variant = 'from', currency: overrideCurrency, autoFill = false }: AmountInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [displayValue, setDisplayValue] = useState('')
  const fieldName = variant === 'from' ? 'amount' : 'toAmount'
  const currencyFieldName = variant === 'from' ? 'currency' : 'toCurrency'
  const amount = form.watch(fieldName as keyof CreateTransaction) as number | undefined
  const fromAmount = form.watch('amount')
  const currency = overrideCurrency || form.watch(currencyFieldName as keyof CreateTransaction) as string

  useEffect(() => {
    if (autoFill && variant === 'to') {
      // For auto-fill "to" inputs, always mirror the from amount
      if (fromAmount) {
        setDisplayValue(fromAmount.toString())
        form.setValue('toAmount', fromAmount)
      } else {
        setDisplayValue('')
        form.setValue('toAmount', undefined as unknown as number)
      }
    } else if (amount) {
      // For regular inputs, show the actual amount
      setDisplayValue(amount.toString())
    } else {
      setDisplayValue('')
    }
  }, [amount, autoFill, variant, fromAmount, form])

  // Set currency when overrideCurrency is provided
  useEffect(() => {
    if (overrideCurrency) {
      if (variant === 'to') {
        form.setValue('toCurrency', overrideCurrency as typeof currencies[number])
      } else {
        form.setValue('currency', overrideCurrency as typeof currencies[number])
      }
    }
  }, [overrideCurrency, variant, form])

  const handleContainerClick = () => {
    inputRef.current?.focus()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value

    // Only allow positive numbers
    if (value.startsWith('-')) {
      return
    }

    // Replace comma with dot immediately
    value = value.replace(',', '.')

    // Only allow numbers and dots
    if (!/^[0-9.]*$/.test(value)) {
      return
    }

    // Prevent multiple decimal separators
    const separatorCount = (value.match(/\./g) || []).length
    if (separatorCount > 1) {
      return
    }

    // Update display value
    setDisplayValue(value)

    const numValue = parseFloat(value)
    if (!isNaN(numValue) && numValue > 0) {
      if (variant === 'from') {
        form.setValue('amount', numValue)
      } else {
        form.setValue('toAmount', numValue)
      }
    } else if (value === '') {
      // Don't set to 0, let form validation handle empty values
      if (variant === 'from') {
        form.setValue('amount', undefined as unknown as number)
      } else {
        form.setValue('toAmount', undefined as unknown as number)
      }
    } else if (value.endsWith('.')) {
      // Keep the display value but don't update the form value yet
      // This allows users to type decimal numbers
    }
  }

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "bg-muted/50 rounded-lg p-2",
          autoFill && variant === 'to' ? "opacity-60" : "cursor-text"
        )}
        onClick={!autoFill || variant !== 'to' ? handleContainerClick : undefined}
      >
        <div className="flex items-center justify-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={displayValue}
            onChange={handleInputChange}
            className={cn(
              "text-3xl font-bold transition-opacity bg-transparent border-0 outline-none w-auto text-center",
              "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
              displayValue ? "opacity-100" : "opacity-30"
            )}
            placeholder="0"
            disabled={isSubmitting || (autoFill && variant === 'to')}
            inputMode="decimal"
            pattern="[0-9.]*"
            style={{ width: `${Math.max(1, displayValue.length || 1)}ch` }}
          />

          {overrideCurrency ? (
            <span className="text-3xl font-bold">{currency}</span>
          ) : (
            <Select
              value={currency}
              onValueChange={(value) => {
                if (variant === 'from') {
                  form.setValue('currency', value as typeof currencies[number])
                } else {
                  form.setValue('toCurrency', value as typeof currencies[number])
                }
              }}
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
        </div>
      </div>

      {variant === 'from' && form.formState.errors.amount && (
        <p className="text-sm text-destructive text-center">
          {form.formState.errors.amount.message}
        </p>
      )}
      {variant === 'to' && form.formState.errors.toAmount && (
        <p className="text-sm text-destructive text-center">
          {form.formState.errors.toAmount.message}
        </p>
      )}
    </div>
  )
}
