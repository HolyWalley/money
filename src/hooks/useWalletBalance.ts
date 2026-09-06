import { useWalletBalances } from './useWalletBalances'

export function useWalletBalance(walletId: string): number {
  return useWalletBalances().get(walletId) ?? 0
}
