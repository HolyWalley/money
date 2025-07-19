import { useFormContext } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import type { CreateTransaction } from '../../../shared/schemas/transaction.schema'
import { AmountInput } from './AmountInput'
import { TransactionTypeSwitch } from './TransactionTypeSwitch'
import { DatePicker } from './DatePicker'
import { CategoriesPicker } from './CategoryPicker'
import { FromWalletSelector } from './FromWalletSelector'
import { ToWalletSelector } from './ToWalletSelector'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { SplitDrawer } from './SplitDrawer'
import { ArrowRight } from 'lucide-react'

interface TransactionFormProps {
  isSubmitting: boolean
}

export function TransactionForm({ isSubmitting }: TransactionFormProps) {
  const form = useFormContext<CreateTransaction>()
  const transactionType = form.watch('transactionType')
  const walletId = form.watch('walletId')
  const toWalletId = form.watch('toWalletId')
  const { wallets } = useLiveWallets()

  const fromWallet = wallets.find(w => w._id === walletId)
  const toWallet = wallets.find(w => w._id === toWalletId)
  const isSameCurrency = fromWallet?.currency === toWallet?.currency

  return (
    <>
      <TransactionTypeSwitch isSubmitting={isSubmitting} />

      <div className="flex items-center gap-2 mb-4">
        <FromWalletSelector isSubmitting={isSubmitting} />

        {
          (transactionType === 'transfer') && <>
            <ArrowRight />
            <ToWalletSelector isSubmitting={isSubmitting} />
          </>
        }
      </div>

      <div className="flex items-center gap-2 mb-4">
        <AmountInput
          isSubmitting={isSubmitting}
          size={transactionType === 'transfer' ? 'sm' : 'full'}
          variant="from"
          currency={fromWallet?.currency}
        />

        {
          (transactionType === 'transfer') && <>
            <ArrowRight />
            <AmountInput
              isSubmitting={isSubmitting}
              variant="to"
              size={transactionType === 'transfer' ? 'sm' : 'full'}
              currency={toWallet?.currency || fromWallet?.currency}
              autoFill={isSameCurrency}
            />
          </>
        }
      </div>

      {transactionType === 'expense' && <SplitDrawer />}

      {(transactionType === 'income' || transactionType === 'expense') && (
        <CategoriesPicker isSubmitting={isSubmitting} />
      )}

      <FormField
        control={form.control}
        name="date"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <DatePicker
                value={(() => {
                  try {
                    return field.value ? new Date(field.value) : new Date()
                  } catch {
                    return new Date()
                  }
                })()}
                onChange={(date) => {
                  field.onChange(date.toISOString())
                }}
                disabled={isSubmitting}
                className="w-full"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="note"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Note</FormLabel>
            <FormControl>
              <Input
                placeholder="e.g., Grocery shopping, Salary, Coffee"
                disabled={isSubmitting}
                className="w-full"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  )
}
