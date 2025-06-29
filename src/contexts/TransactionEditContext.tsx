import { createContext, useContext } from 'react'
import type { Transaction } from '../../shared/schemas/transaction.schema'

interface TransactionEditContextType {
  openTransactionEdit: (transaction: Transaction) => void
}

const TransactionEditContext = createContext<TransactionEditContextType | undefined>(undefined)

export function useTransactionEdit() {
  const context = useContext(TransactionEditContext)
  if (!context) {
    throw new Error('useTransactionEdit must be used within TransactionEditProvider')
  }
  return context
}

export const TransactionEditProvider = TransactionEditContext.Provider
