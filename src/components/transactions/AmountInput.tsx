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
}

export function AmountInput({ form, isSubmitting }: AmountInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [displayValue, setDisplayValue] = useState('')
  const amount = form.watch('amount')
  const currency = form.watch('currency')

  useEffect(() => {
    if (amount) {
      setDisplayValue(amount.toString())
    } else {
      setDisplayValue('')
    }
  }, [amount])

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
      form.setValue('amount', numValue)
    } else if (value === '') {
      // Don't set to 0, let form validation handle empty values
      form.setValue('amount', undefined as any)
    } else if (value.endsWith('.')) {
      // Keep the display value but don't update the form value yet
      // This allows users to type decimal numbers
    }
  }

  return (
    <div className="space-y-2">
      <div
        className="bg-muted/50 rounded-lg p-2 cursor-text"
        onClick={handleContainerClick}
      >
        <div className="flex items-center justify-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={displayValue}
            onChange={handleInputChange}
            className={cn(
              "text-5xl font-bold transition-opacity bg-transparent border-0 outline-none w-auto text-center",
              "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
              displayValue ? "opacity-100" : "opacity-30"
            )}
            placeholder="0"
            disabled={isSubmitting}
            inputMode="decimal"
            pattern="[0-9.]*"
            style={{ width: `${Math.max(1, displayValue.length || 1)}ch` }}
          />

          <Select
            value={currency}
            onValueChange={(value) => form.setValue('currency', value as typeof currencies[number])}
            disabled={isSubmitting}
          >
            <SelectTrigger
              className="w-auto border-0 !bg-transparent hover:!bg-transparent dark:!bg-transparent dark:hover:!bg-transparent text-5xl font-bold p-0 h-auto focus:ring-0 focus:ring-offset-0 [&>svg]:hidden shadow-none"
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
        </div>
      </div>

      {form.formState.errors.amount && (
        <p className="text-sm text-destructive text-center">
          {form.formState.errors.amount.message}
        </p>
      )}
    </div>
  )
}
