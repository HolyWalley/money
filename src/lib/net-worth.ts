import { getWalletBalanceDelta, type BalanceTransaction } from './wallet-balance'
import type { Converter } from './currency-conversion'
import type { Wallet } from '../../shared/schemas/wallet.schema'

export type BalanceWallet = Pick<Wallet, '_id' | 'currency' | 'initialBalance' | 'isSavings'>

export interface NetWorthSummary {
  total: number
  spendable: number
  savings: number
  missingCurrencies: string[]
}

/**
 * Every wallet's balance from a single pass over the ledger.
 *
 * The per-wallet query costs an index scan each, and net worth needs all of
 * them at once, so this reads the ledger once rather than once per wallet.
 */
export function computeWalletBalances(
  wallets: BalanceWallet[],
  transactions: BalanceTransaction[]
): Map<string, number> {
  const balances = new Map<string, number>()

  for (const wallet of wallets) {
    balances.set(wallet._id, wallet.initialBalance)
  }

  for (const transaction of transactions) {
    const from = balances.get(transaction.walletId)
    if (from !== undefined) {
      balances.set(transaction.walletId, from + getWalletBalanceDelta(transaction, transaction.walletId))
    }

    const toWalletId = transaction.toWalletId
    // The delta already covers both sides of a transfer, so a wallet that is
    // both sides of one must not be paid twice.
    if (!toWalletId || toWalletId === transaction.walletId) continue

    const to = balances.get(toWalletId)
    if (to !== undefined) {
      balances.set(toWalletId, to + getWalletBalanceDelta(transaction, toWalletId))
    }
  }

  return balances
}

/**
 * Net worth split by what the money is for. Savings sits apart from spendable
 * because it is already spoken for - counting it as available is how a month
 * ends up spending its own emergency fund.
 */
export function summarizeNetWorth(
  wallets: BalanceWallet[],
  balances: Map<string, number>,
  convert: Converter
): NetWorthSummary {
  let spendable = 0
  let savings = 0
  const missing = new Set<string>()

  for (const wallet of wallets) {
    const balance = balances.get(wallet._id) ?? 0
    const converted = convert(balance, wallet.currency)

    if (converted === null) {
      missing.add(wallet.currency)
      continue
    }

    if (wallet.isSavings) {
      savings += converted
    } else {
      spendable += converted
    }
  }

  return {
    total: spendable + savings,
    spendable,
    savings,
    missingCurrencies: [...missing].sort(),
  }
}
