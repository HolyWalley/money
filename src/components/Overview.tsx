import { type TransactionFilters } from '@/hooks/useLiveTransactions'
import { PeriodFilter } from './transactions/PeriodFilter'
import { useFilters } from '@/hooks/useFilters'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { useAuth } from '@/contexts/AuthContext'
import { useMemo } from 'react'
import { useDecoratedTransactions } from '@/hooks/useDecoratedTransactions'
import { ExpensesByCategoryChart } from './ExpensesByCategoryChart'

export function Overview() {
  const wallets = useLiveWallets()
  const categories = useLiveCategories()
  const [filters, handleFiltersChange] = useFilters({ wallets, categories }) as [TransactionFilters, (filters: TransactionFilters) => void]
  const { transactions, isLoading } = useDecoratedTransactions(filters)
  const { user } = useAuth()

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
        expense += t.amountInBaseCurrency

        // Track expenses by category
        if (t.categoryId) {
          const current = categoryExpenses.get(t.categoryId) || 0
          categoryExpenses.set(t.categoryId, current + t.amountInBaseCurrency)
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

  if (!baseCurrency) {
    return null
  }

  if (isLoading || filters.isLoading) {
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

  return (
    <div className="container mx-auto h-full flex flex-col">
      <div className="mb-4 flex-shrink-0 px-4 pt-4">
        <PeriodFilter
          filters={filters}
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
          />
        )}
      </div>
    </div>
  )
}
