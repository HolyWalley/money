import type { UseFormReturn } from 'react-hook-form'
import type { CreateTransaction } from '../../../shared/schemas/transaction.schema'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { WalletSelector } from './WalletSelector'

interface ToWalletSelectorProps {
  form: UseFormReturn<CreateTransaction>
  isSubmitting: boolean
}

export function ToWalletSelector({ form, isSubmitting }: ToWalletSelectorProps) {
  const { wallets } = useLiveWallets()
  const fromWalletId = form.watch('walletId')

  return (
    <WalletSelector
      form={form}
      wallets={wallets}
      isSubmitting={isSubmitting}
      fieldName="toWalletId"
      label="To Wallet"
      placeholder="Select destination wallet"
      excludeWalletId={fromWalletId}
    />
  )
}
