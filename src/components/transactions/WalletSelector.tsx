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
import { formatWalletBalance, formatWalletName } from '@/lib/wallet-utils'

interface WalletSelectorProps {
  wallets: Wallet[]
  isSubmitting: boolean
  fieldName: 'walletId' | 'toWalletId'
  placeholder: string
  excludeWalletId?: string
  balance?: number
}

export function WalletSelector({
  wallets,
  isSubmitting,
  fieldName,
  placeholder,
  excludeWalletId,
  balance,
}: WalletSelectorProps) {
  const form = useFormContext<CreateTransaction>()
  const filteredWallets = excludeWalletId
    ? wallets.filter(w => w._id !== excludeWalletId)
    : wallets

  // Base UI renders the raw value in the trigger unless it can map it to a label.
  const items = filteredWallets.map(wallet => ({
    value: wallet._id,
    label: formatWalletName(wallet),
  }))

  return (
    <FormField
      control={form.control}
      name={fieldName}
      render={({ field }) => (
        <FormItem className="flex-1">
          <Select
            items={items}
            value={field.value}
            onValueChange={field.onChange}
            disabled={isSubmitting}
          >
            <FormControl>
              <SelectTrigger className="w-full min-w-0">
                <SelectValue className="min-w-0 truncate" placeholder={placeholder} />
                {balance !== undefined && (
                  <span className="ml-auto shrink-0 text-sm text-muted-foreground tabular-nums">
                    {formatWalletBalance(balance)}
                  </span>
                )}
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

