import { useLiveWallets } from '@/hooks/useLiveWallets'
import { WalletSelector } from './WalletSelector'

interface FromWalletSelectorProps {
  isSubmitting: boolean
}

export function FromWalletSelector({ isSubmitting }: FromWalletSelectorProps) {
  const { wallets } = useLiveWallets()

  return (
    <WalletSelector
      wallets={wallets}
      isSubmitting={isSubmitting}
      fieldName="walletId"
      placeholder="Select wallet"
    />
  )
}
