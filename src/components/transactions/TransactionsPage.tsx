import { useState, useCallback } from 'react'
import { useLiveTransactions, type TransactionFilters } from '@/hooks/useLiveTransactions'
import { useIsMobile } from '@/hooks/use-mobile'
import { VirtualizedTransactionList } from './VirtualizedTransactionList'
import { PeriodFilter } from './PeriodFilter'

export function TransactionsPage() {
  const [filters, setFilters] = useState<TransactionFilters>({})
  const { transactions, isLoading } = useLiveTransactions(filters)
  const isMobile = useIsMobile()

  const handleFiltersChange = useCallback((newFilters: TransactionFilters) => {
    setFilters(newFilters)
  }, [])

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 flex justify-center items-center min-h-[200px]">
        <div className="text-muted-foreground">Loading transactions...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto h-full flex flex-col">
      <div className="mb-4 flex-shrink-0 px-4 pt-4">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <p className="text-muted-foreground">
          {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
        </p>

        <div className="mt-4">
          <PeriodFilter filters={filters} onFiltersChange={handleFiltersChange} />
        </div>
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
