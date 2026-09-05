import { db } from '@/lib/db-dexie'
import { createSharedLiveQuery } from '@/lib/shared-live-query'
import { computeWalletBalances } from '@/lib/net-worth'

const EMPTY_BALANCES = new Map<string, number>()

// One subscription for the whole app, and one pass over the ledger rather than
// one indexed scan per wallet.
const useSharedWalletBalances = createSharedLiveQuery(async () => {
  const [wallets, transactions] = await Promise.all([
    db.wallets.toArray(),
    db.transactions.toArray(),
  ])

  return computeWalletBalances(wallets, transactions)
})

export function useWalletBalances() {
  const balances = useSharedWalletBalances()

  return {
    balances: balances ?? EMPTY_BALANCES,
    isLoading: balances === undefined,
  }
}
