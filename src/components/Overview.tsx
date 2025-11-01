import { useLiveTransactions, type TransactionFilters } from '@/hooks/useLiveTransactions'
// TODO: Separate filter related components from transactions
import { PeriodFilter } from './transactions/PeriodFilter'
import { useFilters } from '@/hooks/useFilters'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { useAuth } from '@/contexts/AuthContext'

export function Overview() {
  const wallets = useLiveWallets()
  const categories = useLiveCategories()
  const [filters, handleFiltersChange] = useFilters({ wallets, categories }) as [TransactionFilters, (filters: TransactionFilters) => void]
  const { transactions, isLoading } = useLiveTransactions(filters)
  const { user } = useAuth()

  const baseCurrency = user?.settings?.defaultCurrency

  if (!baseCurrency) {
    return null
  }

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
    </div>
  )
}
