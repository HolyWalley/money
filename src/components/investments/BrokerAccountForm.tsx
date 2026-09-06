import type { UseFormReturn } from 'react-hook-form'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatWalletName } from '@/lib/wallet-utils'
import { createBrokerAccountSchema } from '../../../shared/schemas/broker-account.schema'
import type { Broker } from '../../../shared/schemas/broker-account.schema'
import type { Wallet } from '../../../shared/schemas/wallet.schema'

/**
 * `order` is the list's business rather than the user's: investmentService
 * assigns it from the end of the list, and a form that submitted the schema's
 * default of 0 would send every new account to the top.
 */
export const brokerAccountFormSchema = createBrokerAccountSchema.omit({ order: true })

export type BrokerAccountFormValues = z.infer<typeof brokerAccountFormSchema>

const BROKERS: { value: Broker; label: string }[] = [
  { value: 'degiro', label: 'DEGIRO' },
  { value: 'revolut', label: 'Revolut' },
  { value: 'other', label: 'Other' },
]

export function brokerLabel(broker: Broker): string {
  return BROKERS.find(option => option.value === broker)?.label ?? 'Other'
}

/** The select needs a real value for "no wallet"; an absent cashWalletId is what it means. */
export const NO_CASH_WALLET = 'none'

const NO_CASH_WALLET_LABEL = 'No linked wallet'

interface BrokerAccountFormProps {
  form: UseFormReturn<BrokerAccountFormValues>
  wallets: Wallet[]
  isSubmitting: boolean
}

export function BrokerAccountForm({ form, wallets, isSubmitting }: BrokerAccountFormProps) {
  const cashWalletId = form.watch('cashWalletId')

  // Base UI renders the raw value in the trigger unless it can map it to a label.
  const cashWalletItems = [
    { value: NO_CASH_WALLET, label: NO_CASH_WALLET_LABEL },
    ...wallets.map(wallet => ({ value: wallet._id, label: formatWalletName(wallet) })),
  ]

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          {...form.register('name')}
          placeholder="e.g., DEGIRO Custody"
          disabled={isSubmitting}
        />
        {form.formState.errors.name && (
          <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="broker">Broker</Label>
        <Select
          items={BROKERS}
          value={form.watch('broker') ?? 'other'}
          onValueChange={(value: Broker | null) => value && form.setValue('broker', value, { shouldDirty: true })}
          disabled={isSubmitting}
        >
          <SelectTrigger id="broker" className="w-full">
            <SelectValue placeholder="Select a broker" />
          </SelectTrigger>
          <SelectContent>
            {BROKERS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.broker && (
          <p className="text-sm text-destructive">{form.formState.errors.broker.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="cashWalletId">Cash wallet (optional)</Label>
        <Select
          items={cashWalletItems}
          value={cashWalletId ?? NO_CASH_WALLET}
          onValueChange={(value: string | null) =>
            form.setValue(
              'cashWalletId',
              !value || value === NO_CASH_WALLET ? undefined : value,
              { shouldDirty: true }
            )
          }
          disabled={isSubmitting}
        >
          <SelectTrigger id="cashWalletId" className="w-full">
            <SelectValue placeholder={NO_CASH_WALLET_LABEL} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_CASH_WALLET}>{NO_CASH_WALLET_LABEL}</SelectItem>
            {wallets.map((wallet) => (
              <SelectItem key={wallet._id} value={wallet._id}>
                {wallet.name} <span className="text-muted-foreground">({wallet.currency})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          The wallet holding this broker's cash, so imported trades draw from it.
        </p>
        {form.formState.errors.cashWalletId && (
          <p className="text-sm text-destructive">{form.formState.errors.cashWalletId.message}</p>
        )}
      </div>
    </>
  )
}
