import { useState, useEffect } from 'react'
import { useDatabase } from '@/contexts/DatabaseContext'
import type { Transaction } from '../../shared/schemas/transaction.schema'

export function useLiveTransactions() {
  const { transactionService, db, isInitializing } = useDatabase()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!transactionService || !db || isInitializing) return

    let changes: PouchDB.Core.Changes<Transaction> | null = null

    const loadTransactions = async () => {
      try {
        const transactionList = await transactionService.getAllTransactions()
        setTransactions(transactionList)
        setIsLoading(false)
      } catch (error) {
        console.error('Failed to load transactions:', error)
        setIsLoading(false)
      }
    }

    // Initial load
    loadTransactions()

    // Listen for changes
    changes = db.transactions.changes({
      since: 'now',
      live: true,
      include_docs: true
    }).on('change', () => {
      // Reload transactions when any change occurs
      loadTransactions()
    }).on('error', (err) => {
      console.error('Changes feed error:', err)
    })

    return () => {
      // Cleanup listener
      if (changes) {
        changes.cancel()
      }
    }
  }, [transactionService, db, isInitializing])

  return { transactions, isLoading }
}
