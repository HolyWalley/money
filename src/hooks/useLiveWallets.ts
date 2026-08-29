import { db } from '@/lib/db-dexie'
import { createSharedLiveQuery } from '@/lib/shared-live-query'
import type { Wallet } from '../../shared/schemas/wallet.schema'

const EMPTY_WALLETS: Wallet[] = []

const useSharedWallets = createSharedLiveQuery(async () => {
  const dexieWallets = await db.wallets.orderBy('order').toArray()
  // Convert Date objects back to ISO strings for components
  return dexieWallets.map(wallet => ({
    ...wallet,
    createdAt: wallet.createdAt.toISOString(),
    updatedAt: wallet.updatedAt.toISOString()
  })) as Wallet[]
})

export function useLiveWallets() {
  const wallets = useSharedWallets()

  return {
    wallets: wallets || EMPTY_WALLETS,
    isLoading: wallets === undefined
  }
}
