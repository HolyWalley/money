import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db-dexie'
import { useState, useEffect } from 'react'
import { transactionService } from '@/services/transactionService'

export function useWalletBalance(walletId: string) {
  const [balance, setBalance] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(true)

  // Watch for changes in transactions that affect this wallet
  const transactions = useLiveQuery(
    () => db.transactions
      .where('walletId').equals(walletId)
      .or('toWalletId').equals(walletId)
      .toArray(),
    [walletId]
  )

  // Watch for changes in the wallet itself (like initial balance changes)
  const wallet = useLiveQuery(
    () => db.wallets.get(walletId),
    [walletId]
  )

  useEffect(() => {
    async function calculateBalance() {
      try {
        setIsLoading(true)
        const currentBalance = await transactionService.getWalletBalance(walletId)
        setBalance(currentBalance)
      } catch (error) {
        console.error('Error calculating wallet balance:', error)
        setBalance(0)
      } finally {
        setIsLoading(false)
      }
    }

    // Recalculate when transactions or wallet changes
    if (walletId) {
      calculateBalance()
    }
  }, [walletId, transactions, wallet])

  return { balance, isLoading }
}
