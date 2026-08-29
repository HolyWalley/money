import { useLiveWallets } from '@/hooks/useLiveWallets'
import { WalletSelector } from './WalletSelector'

interface FromWalletSelectorProps {
  isSubmitting: boolean
  balance?: number
}

export function FromWalletSelector({ isSubmitting, balance }: FromWalletSelectorProps) {
  const { wallets } = useLiveWallets()

  return (
    <WalletSelector
      wallets={wallets}
      isSubmitting={isSubmitting}
      fieldName="walletId"
      placeholder="Select wallet"
      balance={balance}
    />
  )
}
