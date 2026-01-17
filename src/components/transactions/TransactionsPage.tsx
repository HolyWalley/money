import { useState, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useFilterContext } from '@/contexts/FilterContext'
import { FilterProvider } from '@/contexts/FilterProvider'
import { useIsMobile } from '@/hooks/use-mobile'
import { useDecoratedTransactions } from '@/hooks/useDecoratedTransactions'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { useLiveRecurringPayments } from '@/hooks/useLiveRecurringPayments'
import { type TransactionFilters, getPeriodDates } from '@/hooks/useLiveTransactions'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { PeriodFilter } from './PeriodFilter'
import { QuickFilterChips } from './QuickFilterChips'
import { VirtualizedTransactionList } from './VirtualizedTransactionList'
import { useInitiallyLoaded } from '@/hooks/useInitiallyLoaded'
import { UpcomingPaymentsSection } from '@/components/recurring/UpcomingPaymentsSection'
import type { UpcomingPayment } from '@/hooks/useUpcomingPayments'
import { LogPaymentDrawer } from '@/components/recurring/LogPaymentDrawer'
import { RecurringPaymentDrawer } from '@/components/recurring/RecurringPaymentDrawer'
import { RecurringPaymentEditDrawer } from '@/components/recurring/RecurringPaymentEditDrawer'
import { recurringPaymentService } from '@/services/recurringPaymentService'
import type { DecoratedTransaction } from '@/hooks/useDecoratedTransactions'
import type { RecurringPayment } from '../../../shared/schemas/recurring-payment.schema'

function TransactionsPageContent() {
  const { effectiveFilters, updateBaseFilters, quickFilters, removeQuickFilter, clearQuickFilters, toggleQuickFilter } = useFilterContext()
  const { transactions, isLoading } = useDecoratedTransactions(effectiveFilters)
  const isMobile = useIsMobile()
  const { user } = useAuth()
  const wallets = useLiveWallets()
  const categories = useLiveCategories()
  const { recurringPayments } = useLiveRecurringPayments(false)
  const initiallyLoaded = useInitiallyLoaded(isLoading)
  const [logPaymentDrawerOpen, setLogPaymentDrawerOpen] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<UpcomingPayment | null>(null)
  const [makeRecurringDrawerOpen, setMakeRecurringDrawerOpen] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<DecoratedTransaction | null>(null)
  const [editRecurringDrawerOpen, setEditRecurringDrawerOpen] = useState(false)
  const [selectedRecurringPayment, setSelectedRecurringPayment] = useState<RecurringPayment | null>(null)

  const baseCurrency = user?.settings?.defaultCurrency

  const recurringPaymentsById = useMemo(() => {
    const map = new Map<string, RecurringPayment>()
    for (const rp of recurringPayments) {
      map.set(rp._id, rp)
    }
    return map
  }, [recurringPayments])

  const getRecurringForTransaction = (transaction: DecoratedTransaction): RecurringPayment | undefined => {
    // Check if this is the source transaction
    for (const rp of recurringPayments) {
      if (rp.sourceTransactionId === transaction._id) {
        return rp
      }
    }
    // Check if this transaction was logged from a recurring payment
    if (transaction.recurringPaymentLogId) {
      // Log ID format is: ${recurringPaymentId}_${dateStr}
      const recurringPaymentId = transaction.recurringPaymentLogId.split('_')[0]
      return recurringPaymentsById.get(recurringPaymentId)
    }
    return undefined
  }

  const periodDates = useMemo(() => {
    if (!effectiveFilters.period) {
      return { start: new Date(), end: new Date() }
    }
    return getPeriodDates(effectiveFilters.period)
  }, [effectiveFilters.period])

  if (!initiallyLoaded) {
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

  const handleLogPayment = (payment: UpcomingPayment) => {
    setSelectedPayment(payment)
    setLogPaymentDrawerOpen(true)
  }

  const handleSkipPayment = async (payment: UpcomingPayment) => {
    try {
      await recurringPaymentService.skipRecurringPayment(
        payment.recurring._id,
        payment.scheduledDate
      )
    } catch (error) {
      console.error('Failed to skip payment:', error)
    }
  }

  const handleMakeRecurring = (transaction: DecoratedTransaction) => {
    const existingRecurring = getRecurringForTransaction(transaction)
    if (existingRecurring) {
      setSelectedRecurringPayment(existingRecurring)
      setEditRecurringDrawerOpen(true)
    } else {
      setSelectedTransaction(transaction)
      setMakeRecurringDrawerOpen(true)
    }
  }

  return (
    <>
      <div className="h-full flex flex-col">
        <div className="mb-4 flex-shrink-0 px-4 pt-4">
          <PeriodFilter
            filters={effectiveFilters}
            onFiltersChange={handleFiltersChange}
            subtitle={`${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}`}
          />
        </div>

        <UpcomingPaymentsSection
          periodStart={periodDates.start}
          periodEnd={periodDates.end}
          categories={categories.categories}
          wallets={wallets.wallets}
          onLogPayment={handleLogPayment}
          onSkipPayment={handleSkipPayment}
        />

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
            onMakeRecurring={handleMakeRecurring}
            getRecurringForTransaction={getRecurringForTransaction}
          />
        </div>
      </div>

      <LogPaymentDrawer
        open={logPaymentDrawerOpen}
        onOpenChange={setLogPaymentDrawerOpen}
        payment={selectedPayment}
      />

      {selectedTransaction && (
        <RecurringPaymentDrawer
          open={makeRecurringDrawerOpen}
          onOpenChange={setMakeRecurringDrawerOpen}
          transaction={selectedTransaction}
        />
      )}

      <RecurringPaymentEditDrawer
        open={editRecurringDrawerOpen}
        onOpenChange={setEditRecurringDrawerOpen}
        payment={selectedRecurringPayment}
      />
    </>
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
