import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db-dexie'
import type { Wallet } from '../../shared/schemas/wallet.schema'

export function useLiveWallets() {
  const wallets = useLiveQuery(async () => {
    const dexieWallets = await db.wallets.orderBy('order').toArray()
    // Convert Date objects back to ISO strings for components
    return dexieWallets.map(wallet => ({
      ...wallet,
      createdAt: wallet.createdAt.toISOString(),
      updatedAt: wallet.updatedAt.toISOString()
    })) as Wallet[]
  }, [])

  return { 
    wallets: wallets || [], 
    isLoading: wallets === undefined 
  }
}
