import { useMemo } from 'react'
import { walletsStore } from './useLiveWallets'
import { transactionsStore } from './useLiveTransactions'
import { brokerAccountsStore } from './useLiveBrokerAccounts'
import { tradesStore } from './useLiveTrades'
import { computeWalletBalances } from '@/lib/net-worth'

// One pass over the ledger rather than one indexed scan per wallet, off the
// stores every other reader shares. Trades come with it because a wallet
// linked as a broker's cash is spent down by that broker's own rows, which are
// never written as transactions.
export function useWalletBalances(): Map<string, number> {
  const wallets = walletsStore()
  const transactions = transactionsStore()
  const brokerAccounts = brokerAccountsStore()
  const trades = tradesStore()

  return useMemo(
    () => computeWalletBalances(wallets, transactions, brokerAccounts, trades),
    [wallets, transactions, brokerAccounts, trades]
  )
}
