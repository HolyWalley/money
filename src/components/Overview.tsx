import { getPeriodDates, type TransactionFilters } from '@/hooks/useLiveTransactions'
import { PeriodFilter } from './transactions/PeriodFilter'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { useAuth } from '@/contexts/AuthContext'
import { useCallback, useMemo, useState, useEffect } from 'react'
import { useDecoratedTransactions } from '@/hooks/useDecoratedTransactions'
import { ExpensesByCategoryChart } from './ExpensesByCategoryChart'
import { VirtualizedTransactionList } from './transactions/VirtualizedTransactionList'
import { useIsMobile } from '@/hooks/use-mobile'
import { FilterProvider } from '@/contexts/FilterProvider'
import { useFilterContext } from '@/contexts/FilterContext'
import { QuickFilterChips } from './transactions/QuickFilterChips'
import { useInitiallyLoaded } from '@/hooks/useInitiallyLoaded'
import { useNetWorth } from '@/hooks/useNetWorth'
import { usePeriodCommitments } from '@/hooks/usePeriodCommitments'
import { usePreviousPeriodCashflow } from '@/hooks/usePeriodComparison'
import { usePeriodTrend } from '@/hooks/usePeriodTrend'
import { summarizeCashflow } from '@/lib/cashflow'
import { formatMoney } from '@/lib/format-money'
import { isDateInPeriod } from '@/lib/period-utils'
import { BalanceSummaryCard } from './overview/BalanceSummaryCard'
import { CashflowTrendChart } from './overview/CashflowTrendChart'
import { StatDelta } from './overview/StatDelta'

function OverviewContent() {
  const { effectiveFilters, updateBaseFilters, quickFilters, clearQuickFilters, toggleQuickFilter, setQuickFiltersForType } = useFilterContext()
  const { transactions, isLoading } = useDecoratedTransactions(effectiveFilters)
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const wallets = useLiveWallets()
  const categories = useLiveCategories()
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)

  const baseCurrency = user?.settings?.defaultCurrency

  const { totalIncome, totalExpense, cashFlow, expensesByCategory } = useMemo(() => {
    const summary = summarizeCashflow(transactions)
    return {
      totalIncome: summary.income,
      totalExpense: summary.expense,
      cashFlow: summary.cashFlow,
      expensesByCategory: summary.expensesByCategory,
    }
  }, [transactions])

  const periodDates = useMemo(() => {
    if (!effectiveFilters.period) {
      return { start: new Date(), end: new Date() }
    }
    return getPeriodDates(effectiveFilters.period)
  }, [effectiveFilters.period])

  const netWorth = useNetWorth()
  const commitments = usePeriodCommitments(periodDates.start, periodDates.end)
  const comparison = usePreviousPeriodCashflow(effectiveFilters)
  const trend = usePeriodTrend(effectiveFilters)

  // Today's balance answers for today. Setting it against a period we are not
  // living in would subtract commitments that were settled months ago.
  const isCurrentPeriod = useMemo(() => isDateInPeriod(new Date(), periodDates), [periodDates])

  const committed = useMemo(() => {
    if (!isCurrentPeriod || commitments.isLoading) return null
    return {
      recurring: commitments.recurring,
      savings: commitments.savings,
      total: commitments.total,
    }
  }, [isCurrentPeriod, commitments])

  const unconvertedCurrencies = useMemo(() => {
    const currencies = new Set(netWorth.missingCurrencies)
    if (committed) {
      for (const currency of commitments.missingCurrencies) {
        currencies.add(currency)
      }
    }
    return [...currencies].sort()
  }, [netWorth.missingCurrencies, committed, commitments.missingCurrencies])

  const showDeltas = comparison.available && !comparison.isLoading

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

  const initiallyLoaded = useInitiallyLoaded(isLoading)

  const handleFiltersChange = useCallback((newFilters: TransactionFilters) => {
    updateBaseFilters(newFilters)
  }, [updateBaseFilters])

  const handleWalletClick = useCallback((walletId: string, walletName: string) => {
    toggleQuickFilter({
      type: 'wallet',
      value: walletId,
      label: walletName,
    })
  }, [toggleQuickFilter])

  const handleCategoryClick = useCallback((categoryId: string, categoryName: string) => {
    toggleQuickFilter({
      type: 'category',
      value: categoryId,
      label: categoryName,
    })
  }, [toggleQuickFilter])

  if (!initiallyLoaded) {
    return null
  }

  if (!baseCurrency) {
    return null
  }

  const getAmountColor = (amount: number) => {
    if (amount > 0) return 'text-green-600'
    if (amount < 0) return 'text-red-600'
    return 'text-foreground'
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4 flex-shrink-0 px-4 pt-4">
        <PeriodFilter
          filters={effectiveFilters}
          onFiltersChange={handleFiltersChange}
          subtitle={`${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}`}
        />
      </div>

      <QuickFilterChips
        quickFilters={quickFilters}
        wallets={wallets.wallets}
        categories={categories.categories}
        onTypeChange={setQuickFiltersForType}
        onClearAll={clearQuickFilters}
      />

      <div className="px-4 pb-4 space-y-4">
        <BalanceSummaryCard
          total={netWorth.total}
          spendable={netWorth.spendable}
          savings={netWorth.savings}
          baseCurrency={baseCurrency}
          commitments={committed}
          missingCurrencies={unconvertedCurrencies}
        />

        <div className="border rounded-lg p-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Total Income</div>
              <div className="text-lg font-bold text-green-600">
                +{formatMoney(totalIncome)}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{baseCurrency}</span>
                {showDeltas && (
                  <StatDelta
                    current={totalIncome}
                    previous={comparison.summary.income}
                    goodDirection="up"
                    baseCurrency={baseCurrency}
                  />
                )}
              </div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground mb-1">Total Expense</div>
              <div className="text-lg font-bold text-red-600">
                -{formatMoney(totalExpense)}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{baseCurrency}</span>
                {showDeltas && (
                  <StatDelta
                    current={totalExpense}
                    previous={comparison.summary.expense}
                    goodDirection="down"
                    baseCurrency={baseCurrency}
                  />
                )}
              </div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground mb-1">Cash Flow</div>
              <div className={`text-lg font-bold ${getAmountColor(cashFlow)}`}>
                {cashFlow >= 0 ? '+' : ''}{formatMoney(cashFlow)}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{baseCurrency}</span>
                {showDeltas && (
                  <StatDelta
                    current={cashFlow}
                    previous={comparison.summary.cashFlow}
                    goodDirection="up"
                    baseCurrency={baseCurrency}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {trend.available && effectiveFilters.period && (
          <CashflowTrendChart
            points={trend.points}
            periodType={effectiveFilters.period.type}
            baseCurrency={baseCurrency}
          />
        )}

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
              onWalletClick={handleWalletClick}
              onCategoryClick={handleCategoryClick}
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
