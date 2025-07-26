import { type TransactionFilters } from '@/hooks/useLiveTransactions'
import { useState, useEffect, useMemo, useCallback } from 'react'
import type { Wallet } from '../../shared/schemas/wallet.schema'
import type { Category } from '../../shared/schemas/category.schema'

interface UseFiltersProps {
  wallets: {
    wallets: Wallet[],
    isLoading: boolean
  },
  categories: {
    categories: Category[],
    isLoading: boolean
  }
}

export const useFilters = ({ wallets, categories }: UseFiltersProps) => {
  const [filters, setFilters] = useState<TransactionFilters>({ isLoading: true })
  const [initialized, setInitialized] = useState(false)

  // Create stable references for arrays to prevent unnecessary re-renders
  const categoryIds = useMemo(() =>
    categories.categories.map(category => category._id),
    [categories.categories]
  )

  const walletIds = useMemo(() =>
    wallets.wallets.map(wallet => wallet._id),
    [wallets.wallets]
  )

  // Wrapper that automatically adds filterVersion to trigger re-queries
  const updateFilters = useCallback((newFilters: TransactionFilters) => {
    setFilters({
      ...newFilters,
      filterVersion: Date.now().toString()
    })
  }, [])

  useEffect(() => {
    if (initialized || wallets.isLoading || categories.isLoading) {
      return
    }

    updateFilters({
      isLoading: false,
      categoryIds,
      walletIds,
      period: {
        type: 'monthly',
        currentPeriod: 0,
        monthDay: 1
      }
    })
    setInitialized(true)
  }, [initialized, wallets.isLoading, categories.isLoading, categoryIds, walletIds, updateFilters])

  return [filters, updateFilters]
}
