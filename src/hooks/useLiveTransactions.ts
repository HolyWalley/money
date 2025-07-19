import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db-dexie'

export interface TransactionFilters {
  categoryIds?: string[]
  walletIds?: string[]
}

export function useLiveTransactions(filters?: TransactionFilters) {
  const transactions = useLiveQuery(() => {
    let query = db.transactions.orderBy('date').reverse()
    
    if (filters?.categoryIds && filters.categoryIds.length > 0) {
      query = query.filter(t => {
        return t.categoryId ? filters.categoryIds!.includes(t.categoryId) : false
      })
    }
    
    if (filters?.walletIds && filters.walletIds.length > 0) {
      query = query.filter(t => {
        return filters.walletIds!.includes(t.walletId) || 
               (t.toWalletId ? filters.walletIds!.includes(t.toWalletId) : false)
      })
    }
    
    return query.toArray()
  }, [filters?.categoryIds, filters?.walletIds])

  return {
    transactions: transactions || [],
    isLoading: transactions === undefined
  }
}
