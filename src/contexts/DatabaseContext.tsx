import React, { createContext, useContext, useEffect, useState } from 'react'
import { createDatabase, type Database } from '../lib/db'
import { WalletService } from '../services/walletService'
import { TransactionService } from '../services/transactionService'
import { useAuth } from './AuthContext'

interface DatabaseContextType {
  db: Database | null
  walletService: WalletService | null
  transactionService: TransactionService | null
  isInitializing: boolean
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined)

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [db, setDb] = useState<Database | null>(null)
  const [walletService, setWalletService] = useState<WalletService | null>(null)
  const [transactionService, setTransactionService] = useState<TransactionService | null>(null)
  const [isInitializing, setIsInitializing] = useState(false)

  useEffect(() => {
    let database: Database | null = null
    let isCleaningUp = false

    async function initializeDatabase() {
      if (user?.userId && !isCleaningUp) {
        setIsInitializing(true)
        try {
          database = createDatabase(user.userId)
          const walService = new WalletService()
          const transService = new TransactionService()

          if (!isCleaningUp) {
            setDb(database)
            setWalletService(walService)
            setTransactionService(transService)
          }
        } catch (error) {
          if (!isCleaningUp) {
            console.error('Failed to initialize database:', error)
          }
        } finally {
          if (!isCleaningUp) {
            setIsInitializing(false)
          }
        }
      }
    }

    if (user) {
      initializeDatabase()
    } else {
      setDb(null)
      setWalletService(null)
      setTransactionService(null)
    }

    return () => {
      isCleaningUp = true
      setDb(null)
      setWalletService(null)
      setTransactionService(null)
    }
  }, [user])

  return (
    <DatabaseContext.Provider value={{ db, walletService, transactionService, isInitializing }}>
      {children}
    </DatabaseContext.Provider>
  )
}

export function useDatabase() {
  const context = useContext(DatabaseContext)
  if (context === undefined) {
    throw new Error('useDatabase must be used within a DatabaseProvider')
  }
  return context
}
