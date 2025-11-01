import { useLiveTransactions, type TransactionFilters } from '@/hooks/useLiveTransactions'
import { useIsMobile } from '@/hooks/use-mobile'
import { VirtualizedTransactionList } from './VirtualizedTransactionList'
import { PeriodFilter } from './PeriodFilter'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { useFilters } from '@/hooks/useFilters'
import { useAuth } from '@/contexts/AuthContext'
import { useExchangeRates } from '@/hooks/useExchangeRates'
import { useMemo } from 'react'

export function TransactionsPage() {
  const wallets = useLiveWallets()
  const categories = useLiveCategories()
  const [filters, handleFiltersChange] = useFilters({ wallets, categories }) as [TransactionFilters, (filters: TransactionFilters) => void]
  const { transactions, isLoading } = useLiveTransactions(filters)
  const isMobile = useIsMobile()
  const { user } = useAuth()

  const baseCurrency = user?.settings?.defaultCurrency

  // Extract unique currencies and date range from transactions
  const { targetCurrencies, startDate, endDate } = useMemo(() => {
    if (!transactions.length || !baseCurrency) {
      return { targetCurrencies: [], startDate: undefined, endDate: undefined }
    }

    const currencies = new Set<string>()
    let minDate = new Date(transactions[0].date)
    let maxDate = new Date(transactions[0].date)

    transactions.forEach(t => {
      const txDate = new Date(t.date)
      if (txDate < minDate) minDate = txDate
      if (txDate > maxDate) maxDate = txDate

      if (t.currency && t.currency !== baseCurrency) {
        currencies.add(t.currency)
      }
      // For transfers with different currency
      if (t.toCurrency && t.toCurrency !== baseCurrency && t.toCurrency !== t.currency) {
        currencies.add(t.toCurrency)
      }
    })

    return {
      targetCurrencies: Array.from(currencies),
      startDate: minDate,
      endDate: maxDate
    }
  }, [transactions, baseCurrency])

  const { rates, isLoading: isLoadingRates } = useExchangeRates({
    baseCurrency,
    targetCurrencies,
    startDate,
    endDate,
  })

  if (isLoading || filters.isLoading || isLoadingRates) {
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
          baseCurrency={baseCurrency}
          exchangeRates={rates}
        />
      </div>
    </div>
  )
}
