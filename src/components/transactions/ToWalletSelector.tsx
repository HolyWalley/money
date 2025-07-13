import { useFormContext } from 'react-hook-form'
import type { CreateTransaction } from '../../../shared/schemas/transaction.schema'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { WalletSelector } from './WalletSelector'

interface ToWalletSelectorProps {
  isSubmitting: boolean
}

export function ToWalletSelector({ isSubmitting }: ToWalletSelectorProps) {
  const form = useFormContext<CreateTransaction>()
  const { wallets } = useLiveWallets()
  const fromWalletId = form.watch('walletId')

  return (
    <WalletSelector
      wallets={wallets}
      isSubmitting={isSubmitting}
      fieldName="toWalletId"
      label="To Wallet"
      placeholder="Select destination wallet"
      excludeWalletId={fromWalletId}
    />
  )
}
