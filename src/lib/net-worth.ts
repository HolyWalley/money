import { getWalletBalanceDelta, type BalanceTransaction } from './wallet-balance'
import type { Converter } from './currency-conversion'
import type { Wallet } from '../../shared/schemas/wallet.schema'

export type BalanceWallet = Pick<Wallet, '_id' | 'currency' | 'initialBalance' | 'isSavings'>

/**
 * What is held through a broker, stated the way net worth needs it: already in
 * the base currency, and honest about what it could not value.
 *
 * Positions only. A broker's cash sits in an ordinary wallet of the user's own,
 * so it arrives through `wallets` like any other balance.
 */
export interface InvestmentHoldings {
  /** Market value of everything still held, in the base currency. */
  marketValue: number
  /** Currencies no rate reached, so nothing held in them is in `marketValue`. */
  missingCurrencies: string[]
  /** Holdings left out of `marketValue` because nothing could value them. */
  unvalued: number
}

export interface NetWorthSummary {
  total: number
  spendable: number
  savings: number
  /**
   * Holdings at market value, or null when there is no brokerage at all - a
   * cash-only net worth should not sprout a row that permanently reads zero.
   */
  investments: number | null
  missingCurrencies: string[]
  /** How many holdings `total` is missing because nothing could value them. */
  unvaluedHoldings: number
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
 * ends up spending its own emergency fund - and holdings sit apart from both,
 * for the same reason twice over: a brokerage account is not this month's
 * grocery money, however well the market did.
 *
 * The gaps the two sides report are merged rather than averaged away. A total
 * that quietly drops an unpriced holding reads as a smaller net worth instead
 * of an incomplete one.
 */
export function summarizeNetWorth(
  wallets: BalanceWallet[],
  balances: Map<string, number>,
  convert: Converter,
  investments: InvestmentHoldings | null = null
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

  for (const currency of investments?.missingCurrencies ?? []) {
    missing.add(currency)
  }

  const holdings = investments?.marketValue ?? 0

  return {
    total: spendable + savings + holdings,
    spendable,
    savings,
    investments: investments ? holdings : null,
    missingCurrencies: [...missing].sort(),
    unvaluedHoldings: investments?.unvalued ?? 0,
  }
}
