import React, { createContext, useContext, useEffect, useState } from 'react'
import { createDatabase, type Database } from '../lib/db'
import { CategoryService } from '../services/categoryService'
import { WalletService } from '../services/walletService'
import { useAuth } from './AuthContext'

interface DatabaseContextType {
  db: Database | null
  categoryService: CategoryService | null
  walletService: WalletService | null
  isInitializing: boolean
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined)

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [db, setDb] = useState<Database | null>(null)
  const [categoryService, setCategoryService] = useState<CategoryService | null>(null)
  const [walletService, setWalletService] = useState<WalletService | null>(null)
  const [isInitializing, setIsInitializing] = useState(false)

  useEffect(() => {
    let database: Database | null = null
    let isCleaningUp = false

    async function initializeDatabase() {
      if (user?.userId && !isCleaningUp) {
        console.log('Initializing database for user:', user.userId)
        setIsInitializing(true)
        try {
          database = createDatabase(user.userId)
          const catService = new CategoryService(database)
          const walService = new WalletService(database)

          if (!isCleaningUp) {
            await catService.initializeDefaultCategories(user.userId)
          }

          if (!isCleaningUp) {
            setDb(database)
            setCategoryService(catService)
            setWalletService(walService)
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
      setCategoryService(null)
      setWalletService(null)
    }

    return () => {
      isCleaningUp = true
      setDb(null)
      setCategoryService(null)
      setWalletService(null)
    }
  }, [user])

  return (
    <DatabaseContext.Provider value={{ db, categoryService, walletService, isInitializing }}>
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
