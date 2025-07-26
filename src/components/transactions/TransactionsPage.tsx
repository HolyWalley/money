import { useState, useEffect, useMemo, useCallback } from 'react'
import { useLiveTransactions, type TransactionFilters } from '@/hooks/useLiveTransactions'
import { useIsMobile } from '@/hooks/use-mobile'
import { VirtualizedTransactionList } from './VirtualizedTransactionList'
import { PeriodFilter } from './PeriodFilter'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import type { Wallet } from '../../../shared/schemas/wallet.schema'
import type { Category } from '../../../shared/schemas/category.schema'

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

const useFilters = ({ wallets, categories }: UseFiltersProps) => {
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

export function TransactionsPage() {
  const wallets = useLiveWallets()
  const categories = useLiveCategories()
  const [filters, handleFiltersChange] = useFilters({ wallets, categories }) as [TransactionFilters, (filters: TransactionFilters) => void]
  const { transactions, isLoading } = useLiveTransactions(filters)
  const isMobile = useIsMobile()

  if (isLoading || filters.isLoading) {
    return null
  }

  return (
    <div className="container mx-auto h-full flex flex-col">
      <div className="mb-4 flex-shrink-0 px-4 pt-4">
        <PeriodFilter
          filters={filters}
          onFiltersChange={handleFiltersChange}
          subtitle={`${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}`}
        />
      </div>

      <div className="flex-1 min-h-0 px-4 pb-4">
        <VirtualizedTransactionList
          wallets={wallets.wallets}
          categories={categories.categories}
          transactions={transactions}
          isMobile={isMobile}
        />
      </div>
    </div>
  )
}
