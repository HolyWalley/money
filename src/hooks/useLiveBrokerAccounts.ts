import { db } from '@/lib/db-dexie'
import { createSharedLiveQuery } from '@/lib/shared-live-query'
import type { BrokerAccount } from '../../shared/schemas/broker-account.schema'

const EMPTY_BROKER_ACCOUNTS: BrokerAccount[] = []

const useSharedBrokerAccounts = createSharedLiveQuery(async () => {
  const dexieAccounts = await db.brokerAccounts.orderBy('order').toArray()
  // Convert Date objects back to ISO strings for components
  return dexieAccounts.map(account => ({
    ...account,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString()
  })) as BrokerAccount[]
})

export function useLiveBrokerAccounts() {
  const brokerAccounts = useSharedBrokerAccounts()

  return {
    brokerAccounts: brokerAccounts || EMPTY_BROKER_ACCOUNTS,
    isLoading: brokerAccounts === undefined
  }
}
