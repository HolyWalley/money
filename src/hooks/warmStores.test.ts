import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '@/lib/db-dexie'
import { NONE } from '@/lib/suspense'
import { resetSharedLiveQueries } from '@/lib/shared-live-query'
import { warmStores } from './warmStores'
import { brokerAccountsStore } from './useLiveBrokerAccounts'
import { categoriesStore } from './useLiveCategories'
import { instrumentsStore } from './useLiveInstruments'
import { recurringPaymentLogsStore } from './useLiveRecurringPaymentLogs'
import { recurringPaymentsStore } from './useLiveRecurringPayments'
import { savingGoalsStore } from './useLiveSavingGoals'
import { tradesStore } from './useLiveTrades'
import { transactionsStore } from './useLiveTransactions'
import { walletsStore } from './useLiveWallets'

const stores = {
  walletsStore,
  categoriesStore,
  brokerAccountsStore,
  instrumentsStore,
  tradesStore,
  recurringPaymentsStore,
  savingGoalsStore,
  recurringPaymentLogsStore,
  transactionsStore,
}

describe('warmStores', () => {
  beforeEach(() => {
    resetSharedLiveQueries()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('answers every store without a reader', async () => {
    await warmStores()

    for (const [name, store] of Object.entries(stores)) {
      expect(store.peek(), name).not.toBe(NONE)
    }
  })

  // One table failing to read must not keep the others cold.
  it('resolves even when one store cannot answer', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(db.wallets, 'orderBy').mockImplementation(() => {
      throw new Error('index missing')
    })

    await expect(warmStores()).resolves.toBeUndefined()

    expect(walletsStore.peek()).toBe(NONE)
    expect(walletsStore.start().status).toBe('rejected')
    expect(categoriesStore.peek()).not.toBe(NONE)
    expect(consoleError).toHaveBeenCalledWith('The wallets query failed:', expect.any(Error))
  })
})
