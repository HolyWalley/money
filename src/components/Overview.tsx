import { useLiveTransactions, type TransactionFilters } from '@/hooks/useLiveTransactions'
// TODO: Separate filter related components from transactions
import { PeriodFilter } from './transactions/PeriodFilter'
import { useFilters } from '@/hooks/useFilters'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { useCurrencyRates } from '@/hooks/useCurrencyRates'

export function Overview() {
  const wallets = useLiveWallets()
  const categories = useLiveCategories()
  const [filters, handleFiltersChange] = useFilters({ wallets, categories }) as [TransactionFilters, (filters: TransactionFilters) => void]
  const { transactions, isLoading } = useLiveTransactions(filters)

  // 30 days ago to now
  const ratesTable = useCurrencyRates(filters)

  if (ratesTable === undefined) {
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

      <div>
        {
          ratesTable.map((rate, index) => (
            <div key={index} className="p-2 border-b last:border-b-0">
              <div className="text-sm text-gray-500">
                {new Date(rate.ts).toLocaleDateString()}:
              </div>
              <div className="text-lg font-semibold">
                {rate.from} to {rate.to}: {rate.rate ? rate.rate.toFixed(4) : 'N/A'}
              </div>
            </div>
          ))
        }
      </div>
    </div>
  )
}
