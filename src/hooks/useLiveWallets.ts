import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db-dexie'

export function useLiveWallets() {
  const wallets = useLiveQuery(() => db.wallets.orderBy('order').toArray(), [])

  return { 
    wallets: wallets || [], 
    isLoading: wallets === undefined 
  }
}
