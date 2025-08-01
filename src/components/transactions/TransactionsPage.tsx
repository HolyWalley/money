import { useLiveTransactions, type TransactionFilters } from '@/hooks/useLiveTransactions'
import { useIsMobile } from '@/hooks/use-mobile'
import { VirtualizedTransactionList } from './VirtualizedTransactionList'
import { PeriodFilter } from './PeriodFilter'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { useFilters } from '@/hooks/useFilters'
import { useCurrencyRates } from '@/hooks/useCurrencyRates'

export function TransactionsPage() {
  const wallets = useLiveWallets()
  const categories = useLiveCategories()
  const [filters, handleFiltersChange] = useFilters({ wallets, categories }) as [TransactionFilters, (filters: TransactionFilters) => void]
  const { transactions, isLoading } = useLiveTransactions(filters)
  const { rates, isLoading: ratesLoading } = useCurrencyRates(filters)
  const isMobile = useIsMobile()

  if (isLoading || filters.isLoading || ratesLoading) {
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
          rates={rates || []}
          wallets={wallets.wallets}
          categories={categories.categories}
          transactions={transactions}
          isMobile={isMobile}
        />
      </div>
    </div>
  )
}
