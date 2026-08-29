import type { Wallet } from '../../shared/schemas/wallet.schema'

export const UNKNOWN_WALLET_NAME = 'Unknown Wallet'

type NamedWallet = Pick<Wallet, 'name' | 'currency'>
type IdentifiedWallet = NamedWallet & Pick<Wallet, '_id'>

export function formatWalletName(wallet: NamedWallet): string {
  return `${wallet.name} (${wallet.currency})`
}

export function getWalletNameById(wallets: IdentifiedWallet[], walletId: string): string {
  const wallet = wallets.find(w => w._id === walletId)
  return wallet ? formatWalletName(wallet) : UNKNOWN_WALLET_NAME
}
