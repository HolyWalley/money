import { useFormContext } from 'react-hook-form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form'
import type { CreateTransaction } from '../../../shared/schemas/transaction.schema'
import type { Wallet } from '../../../shared/schemas/wallet.schema'

interface WalletSelectorProps {
  wallets: Wallet[]
  isSubmitting: boolean
  fieldName: 'walletId' | 'toWalletId'
  placeholder: string
  excludeWalletId?: string
}

export function WalletSelector({
  wallets,
  isSubmitting,
  fieldName,
  placeholder,
  excludeWalletId,
}: WalletSelectorProps) {
  const form = useFormContext<CreateTransaction>()
  const filteredWallets = excludeWalletId
    ? wallets.filter(w => w._id !== excludeWalletId)
    : wallets

  return (
    <FormField
      control={form.control}
      name={fieldName}
      render={({ field }) => (
        <FormItem className="flex-1">
          <Select
            value={field.value}
            onValueChange={field.onChange}
            disabled={isSubmitting}
          >
            <FormControl>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {filteredWallets.map((wallet) => (
                <SelectItem key={wallet._id} value={wallet._id}>
                  {wallet.name} <span className="text-muted-foreground">({wallet.currency})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

