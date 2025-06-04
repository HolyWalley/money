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
import { currencies } from '../../../shared/schemas/user_settings.schema'
import type { CreateWallet, UpdateWallet } from '../../../shared/schemas/wallet.schema'

interface WalletFormProps {
  form: UseFormReturn<CreateWallet | UpdateWallet>
  isSubmitting: boolean
}

export function WalletForm({ form, isSubmitting }: WalletFormProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          {...form.register('name')}
          placeholder="e.g., Main Checking"
          disabled={isSubmitting}
        />
        {form.formState.errors.name && (
          <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
        )}
      </div>

      <div className="flex gap-4 w-full">
        <div className="space-y-2 flex-1">
          <Label htmlFor="initialBalance">Initial Balance</Label>
          <Input
            id="initialBalance"
            type="number"
            step="0.01"
            {...form.register('initialBalance', { valueAsNumber: true })}
            placeholder="0.00"
            disabled={isSubmitting}
          />
          {'initialBalance' in form.formState.errors && form.formState.errors.initialBalance && (
            <p className="text-sm text-destructive">
              {form.formState.errors.initialBalance.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">Currency</Label>
          <Select
            value={form.watch('currency')}
            onValueChange={(value) => form.setValue('currency', value as typeof currencies[number])}
            disabled={isSubmitting}
          >
            <SelectTrigger id="currency" className="w-[120px]">
              <SelectValue placeholder="Select a currency" />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((currency) => (
                <SelectItem key={currency} value={currency}>
                  {currency}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.currency && (
            <p className="text-sm text-destructive">{form.formState.errors.currency.message}</p>
          )}
        </div>
      </div>
    </>
  )
}
