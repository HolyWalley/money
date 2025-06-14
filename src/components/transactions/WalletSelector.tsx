import type { UseFormReturn } from 'react-hook-form'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CreateTransaction } from '../../../shared/schemas/transaction.schema'
import type { Wallet } from '../../../shared/schemas/wallet.schema'

interface WalletSelectorProps {
  form: UseFormReturn<CreateTransaction>
  wallets: Wallet[]
  isSubmitting: boolean
  fieldName: 'walletId' | 'toWalletId'
  label: string
  placeholder: string
  excludeWalletId?: string
}

export function WalletSelector({
  form,
  wallets,
  isSubmitting,
  fieldName,
  label,
  placeholder,
  excludeWalletId,
}: WalletSelectorProps) {
  const filteredWallets = excludeWalletId
    ? wallets.filter(w => w._id !== excludeWalletId)
    : wallets

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldName}>{label}</Label>
      <Select
        value={form.watch(fieldName)}
        onValueChange={(value) => form.setValue(fieldName, value)}
        disabled={isSubmitting}
      >
        <SelectTrigger id={fieldName} className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {filteredWallets.map((wallet) => (
            <SelectItem key={wallet._id} value={wallet._id}>
              {wallet.name} <span className="text-muted-foreground">({wallet.currency})</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {form.formState.errors[fieldName] && (
        <p className="text-sm text-destructive">{form.formState.errors[fieldName]?.message}</p>
      )}
    </div>
  )
}

