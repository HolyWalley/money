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
import { QuickFilterChips } from './QuickFilterChips'

function TransactionsPageContent() {
  const { effectiveFilters, updateBaseFilters, quickFilters, removeQuickFilter, clearQuickFilters, toggleQuickFilter, isLoading: filtersLoading } = useFilterContext()
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

  const handleWalletClick = (walletId: string, walletName: string) => {
    toggleQuickFilter({
      type: 'wallet',
      value: walletId,
      label: walletName,
    })
  }

  const handleCategoryClick = (categoryId: string, categoryName: string) => {
    toggleQuickFilter({
      type: 'category',
      value: categoryId,
      label: categoryName,
    })
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

      <QuickFilterChips
        quickFilters={quickFilters}
        onRemove={removeQuickFilter}
        onClearAll={clearQuickFilters}
      />

      <div className="flex-1 min-h-0 px-4 pb-4">
        <VirtualizedTransactionList
          wallets={wallets.wallets}
          categories={categories.categories}
          transactions={transactions}
          isMobile={isMobile}
          baseCurrency={baseCurrency}
          onWalletClick={handleWalletClick}
          onCategoryClick={handleCategoryClick}
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
