import { useState, useCallback } from 'react'
import { useLiveTransactions, type TransactionFilters } from '@/hooks/useLiveTransactions'
import { useIsMobile } from '@/hooks/use-mobile'
import { VirtualizedTransactionList } from './VirtualizedTransactionList'
import { PeriodFilter } from './PeriodFilter'

// TODO: there is a sligh blink when wallets for transactions are not yet loaded, we are showign unknown wallet, etc. 
// TODO: seems like filtering might not be applied from the beginning, so, we first see all transactions and then they are filtered
export function TransactionsPage() {
  const [filters, setFilters] = useState<TransactionFilters>({})
  const { transactions, isLoading } = useLiveTransactions(filters)
  const isMobile = useIsMobile()

  const handleFiltersChange = useCallback((newFilters: TransactionFilters) => {
    setFilters(newFilters)
  }, [])

  if (isLoading) {
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
          transactions={transactions}
          isMobile={isMobile}
        />
      </div>
    </div>
  )
}
