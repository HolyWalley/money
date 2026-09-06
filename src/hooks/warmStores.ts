import { documentReady } from '@/lib/document-ready'
import { brokerAccountsStore } from './useLiveBrokerAccounts'
import { categoriesStore } from './useLiveCategories'
import { instrumentsStore } from './useLiveInstruments'
import { recurringPaymentLogsStore } from './useLiveRecurringPaymentLogs'
import { recurringPaymentsStore } from './useLiveRecurringPayments'
import { savingGoalsStore } from './useLiveSavingGoals'
import { tradesStore } from './useLiveTrades'
import { transactionsStore } from './useLiveTransactions'
import { walletsStore } from './useLiveWallets'

const stores = [
  walletsStore,
  categoriesStore,
  brokerAccountsStore,
  instrumentsStore,
  tradesStore,
  recurringPaymentsStore,
  savingGoalsStore,
  recurringPaymentLogsStore,
  transactionsStore,
]

/**
 * Starts every doc-backed store at once, so the cold start pays one parallel
 * round of IndexedDB reads instead of one per hook, and a drawer opened from
 * anywhere finds its store already answered.
 */
export async function warmStores(): Promise<void> {
  await documentReady
  await Promise.allSettled(stores.map(store => store.start()))
}
