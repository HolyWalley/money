import { db } from '@/lib/db-dexie'
import { documentReady } from '@/lib/document-ready'
import { createSharedLiveQuery } from '@/lib/shared-live-query'
import type { Wallet } from '../../shared/schemas/wallet.schema'

export const walletsStore = createSharedLiveQuery(async () => {
  const dexieWallets = await db.wallets.orderBy('order').toArray()
  // Convert Date objects back to ISO strings for components
  return dexieWallets.map(wallet => ({
    ...wallet,
    createdAt: wallet.createdAt.toISOString(),
    updatedAt: wallet.updatedAt.toISOString()
  })) as Wallet[]
}, { after: documentReady, name: 'wallets' })

export function useLiveWallets(): Wallet[] {
  return walletsStore()
}
