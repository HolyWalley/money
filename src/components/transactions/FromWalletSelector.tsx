import type { UseFormReturn } from 'react-hook-form'
import type { CreateTransaction } from '../../../shared/schemas/transaction.schema'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { WalletSelector } from './WalletSelector'

interface FromWalletSelectorProps {
  form: UseFormReturn<CreateTransaction>
  isSubmitting: boolean
}

export function FromWalletSelector({ form, isSubmitting }: FromWalletSelectorProps) {
  const { wallets } = useLiveWallets()

  return (
    <WalletSelector
      form={form}
      wallets={wallets}
      isSubmitting={isSubmitting}
      fieldName="walletId"
      label="From Wallet"
      placeholder="Select wallet"
    />
  )
}
