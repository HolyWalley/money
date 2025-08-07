import { useLiveTransactions, type TransactionFilters } from '@/hooks/useLiveTransactions'
// TODO: Separate filter related components from transactions
import { PeriodFilter } from './transactions/PeriodFilter'
import { useFilters } from '@/hooks/useFilters'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { useCurrencyRates } from '@/hooks/useCurrencyRates'
import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'

export function Overview() {
  const wallets = useLiveWallets()
  const categories = useLiveCategories()
  const [filters, handleFiltersChange] = useFilters({ wallets, categories }) as [TransactionFilters, (filters: TransactionFilters) => void]
  const { transactions, isLoading } = useLiveTransactions(filters)
  const { user } = useAuth()

  const { rates: ratesTable } = useCurrencyRates(filters)

  const transactionsRates = useMemo(() => {
    console.log('Calculating transaction rates', ratesTable, transactions)
    const r = new Map<string, number>()
    if (!ratesTable) {
      return r
    }

    transactions.forEach(transaction => {
      const txTs = new Date(transaction.date).getTime()
      const filteredRates = ratesTable.filter(rate => rate.from === transaction.currency && rate.to === transaction.toCurrency)
      const sortedRates = filteredRates.sort((a, b) => Math.abs(a.ts - txTs) - Math.abs(b.ts - txTs))

      r.set(transaction._id, sortedRates.at(0)?.rate || 1)
    })

    return r
  }, [ratesTable, transactions])

  const baseCurrency = user?.settings?.defaultCurrency

  // TODO: Calculate split transactions correctly
  // TODO: Calculate excluded income transactions properly
  const totalSpent = useMemo(() => {
    if (!baseCurrency) {
      return 0
    }

    return transactions.filter(tx => tx.transactionType === 'expense').reduce((acc, transaction) => {
      if (transaction.currency === baseCurrency) {
        return acc + transaction.amount
      }

      // TODO: Crash if not found, or allow user to provide a default rate
      const rate = transactionsRates.get(transaction._id) || 1
      return acc + (transaction.amount * rate)
    }, 0)
  }, [baseCurrency, transactions, transactionsRates])

  console.log('Total spent:', totalSpent)

  if (!baseCurrency) {
    return null
  }

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
        <p className="text-lg font-semibold px-4">
          Total Spent: {totalSpent.toFixed(2)} {baseCurrency}
        </p>
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
