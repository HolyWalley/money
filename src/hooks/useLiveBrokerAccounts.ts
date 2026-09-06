import { db } from '@/lib/db-dexie'
import { documentReady } from '@/lib/document-ready'
import { createSharedLiveQuery } from '@/lib/shared-live-query'
import type { BrokerAccount } from '../../shared/schemas/broker-account.schema'

export const brokerAccountsStore = createSharedLiveQuery(async () => {
  const dexieAccounts = await db.brokerAccounts.orderBy('order').toArray()
  // Convert Date objects back to ISO strings for components
  return dexieAccounts.map(account => ({
    ...account,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString()
  })) as BrokerAccount[]
}, { after: documentReady, name: 'broker accounts' })

export function useLiveBrokerAccounts(): BrokerAccount[] {
  return brokerAccountsStore()
}
