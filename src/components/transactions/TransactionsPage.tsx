import { type TransactionFilters } from '@/hooks/useLiveTransactions'
import { useIsMobile } from '@/hooks/use-mobile'
import { VirtualizedTransactionList } from './VirtualizedTransactionList'
import { PeriodFilter } from './PeriodFilter'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { useAuth } from '@/contexts/AuthContext'
import { useDecoratedTransactions } from '@/hooks/useDecoratedTransactions'
import { FilterProvider } from '@/contexts/FilterProvider'
import { useFilterContext } from '@/contexts/FilterContext'

function TransactionsPageContent() {
  const { effectiveFilters, updateBaseFilters, isLoading: filtersLoading } = useFilterContext()
  const { transactions, isLoading } = useDecoratedTransactions(effectiveFilters)
  const isMobile = useIsMobile()
  const { user } = useAuth()
  const wallets = useLiveWallets()
  const categories = useLiveCategories()

  const baseCurrency = user?.settings?.defaultCurrency

  if (isLoading || filtersLoading) {
    return null
  }

  const handleFiltersChange = (newFilters: TransactionFilters) => {
    updateBaseFilters(newFilters)
  }

  return (
    <div className="container mx-auto h-full flex flex-col">
      <div className="mb-4 flex-shrink-0 px-4 pt-4">
        <PeriodFilter
          filters={effectiveFilters}
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
          baseCurrency={baseCurrency}
        />
      </div>
    </div>
  )
}

export function TransactionsPage() {
  const wallets = useLiveWallets()
  const categories = useLiveCategories()

  return (
    <FilterProvider page="transactions" wallets={wallets} categories={categories}>
      <TransactionsPageContent />
    </FilterProvider>
  )
}
