import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db-dexie'

export function useLiveTransactions() {
  const transactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), [])

  return {
    transactions: transactions || [],
    isLoading: transactions === undefined
  }
}
