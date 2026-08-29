import { useLiveQuery } from 'dexie-react-hooks'
import { transactionService } from '@/services/transactionService'

export function useWalletBalance(walletId: string) {
  // Recomputes automatically when the wallet (initial balance) or any of its
  // transactions change - Dexie tracks the queries made inside the callback.
  const balance = useLiveQuery(
    async () => {
      if (!walletId) return undefined

      try {
        return await transactionService.getWalletBalance(walletId)
      } catch (error) {
        console.error('Error calculating wallet balance:', error)
        return 0
      }
    },
    [walletId]
  )

  return {
    balance: balance ?? 0,
    isLoading: balance === undefined,
  }
}
