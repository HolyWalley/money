import { type TransactionFilters } from '@/hooks/useLiveTransactions'
import { PeriodFilter } from './transactions/PeriodFilter'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { useAuth } from '@/contexts/AuthContext'
import { useMemo, useState, useEffect } from 'react'
import { useDecoratedTransactions } from '@/hooks/useDecoratedTransactions'
import { ExpensesByCategoryChart } from './ExpensesByCategoryChart'
import { getEffectiveAmount } from '@/lib/transaction-utils'
import { VirtualizedTransactionList } from './transactions/VirtualizedTransactionList'
import { useIsMobile } from '@/hooks/use-mobile'
import { FilterProvider } from '@/contexts/FilterProvider'
import { useFilterContext } from '@/contexts/FilterContext'

function OverviewContent() {
  const { effectiveFilters, updateBaseFilters, isLoading: filtersLoading } = useFilterContext()
  const { transactions, isLoading } = useDecoratedTransactions(effectiveFilters)
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const wallets = useLiveWallets()
  const categories = useLiveCategories()
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)

  const baseCurrency = user?.settings?.defaultCurrency

  const { totalIncome, totalExpense, cashFlow, expensesByCategory } = useMemo(() => {
    let income = 0
    let expense = 0
    const categoryExpenses = new Map<string, number>()

    transactions.forEach(t => {
      if (t.amountInBaseCurrency === null) return

      if (t.transactionType === 'income') {
        // Skip reimbursement income - it's not real income
        if (t.reimbursement) return
        income += t.amountInBaseCurrency
      } else if (t.transactionType === 'expense') {
        const effectiveAmount = getEffectiveAmount(t)
        if (effectiveAmount === null) return

        expense += effectiveAmount

        // Track expenses by category
        if (t.categoryId) {
          const current = categoryExpenses.get(t.categoryId) || 0
          categoryExpenses.set(t.categoryId, current + effectiveAmount)
        }
      }
      // Skip transfers - they don't affect total income/expense
    })

    return {
      totalIncome: income,
      totalExpense: expense,
      cashFlow: income - expense,
      expensesByCategory: categoryExpenses,
    }
  }, [transactions])

  const filteredTransactions = useMemo(() => {
    if (!selectedCategoryId) return []
    return transactions.filter(t => t.categoryId === selectedCategoryId)
  }, [transactions, selectedCategoryId])

  useEffect(() => {
    if (expensesByCategory.size === 0) {
      setSelectedCategoryId(null)
      return
    }

    let maxCategoryId: string | null = null
    let maxAmount = 0

    expensesByCategory.forEach((amount, categoryId) => {
      if (amount > maxAmount) {
        maxAmount = amount
        maxCategoryId = categoryId
      }
    })

    setSelectedCategoryId(maxCategoryId)
  }, [expensesByCategory])

  if (!baseCurrency) {
    return null
  }

  if (isLoading || filtersLoading) {
    return null
  }

  const formatAmount = (amount: number) => {
    return amount.toFixed(2)
  }

  const getAmountColor = (amount: number) => {
    if (amount > 0) return 'text-green-600'
    if (amount < 0) return 'text-red-600'
    return 'text-foreground'
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

      <div className="px-4 pb-4 space-y-4">
        <div className="border rounded-lg p-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Total Income</div>
              <div className="text-lg font-bold text-green-600">
                +{formatAmount(totalIncome)}
              </div>
              <div className="text-xs text-muted-foreground">{baseCurrency}</div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground mb-1">Total Expense</div>
              <div className="text-lg font-bold text-red-600">
                -{formatAmount(totalExpense)}
              </div>
              <div className="text-xs text-muted-foreground">{baseCurrency}</div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground mb-1">Cash Flow</div>
              <div className={`text-lg font-bold ${getAmountColor(cashFlow)}`}>
                {cashFlow >= 0 ? '+' : ''}{formatAmount(cashFlow)}
              </div>
              <div className="text-xs text-muted-foreground">{baseCurrency}</div>
            </div>
          </div>
        </div>

        {expensesByCategory.size > 0 && (
          <ExpensesByCategoryChart
            expensesByCategory={expensesByCategory}
            categories={categories.categories}
            baseCurrency={baseCurrency}
            selectedCategoryId={selectedCategoryId}
            onCategoryClick={setSelectedCategoryId}
          />
        )}

        {selectedCategoryId && filteredTransactions.length > 0 && (
          <div className="h-[400px]">
            <VirtualizedTransactionList
              transactions={filteredTransactions}
              wallets={wallets.wallets}
              categories={categories.categories}
              isMobile={isMobile}
              baseCurrency={baseCurrency}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export function Overview() {
  const wallets = useLiveWallets()
  const categories = useLiveCategories()

  return (
    <FilterProvider page="overview" wallets={wallets} categories={categories}>
      <OverviewContent />
    </FilterProvider>
  )
}
