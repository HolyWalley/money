import { db } from '@/lib/db-dexie'
import { createSharedLiveQuery } from '@/lib/shared-live-query'
import { computeWalletBalances } from '@/lib/net-worth'

const EMPTY_BALANCES = new Map<string, number>()

// One subscription for the whole app, and one pass over the ledger rather than
// one indexed scan per wallet. Trades come with it because a wallet linked as a
// broker's cash is spent down by that broker's own rows, which are never
// written as transactions.
const useSharedWalletBalances = createSharedLiveQuery(async () => {
  const [wallets, transactions, brokerAccounts, trades] = await Promise.all([
    db.wallets.toArray(),
    db.transactions.toArray(),
    db.brokerAccounts.toArray(),
    db.trades.toArray(),
  ])

  return computeWalletBalances(wallets, transactions, brokerAccounts, trades)
})

export function useWalletBalances() {
  const balances = useSharedWalletBalances()

  return {
    balances: balances ?? EMPTY_BALANCES,
    isLoading: balances === undefined,
  }
}
