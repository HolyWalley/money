import type { BrokerAccount } from '../../shared/schemas/broker-account.schema'
import type { Trade } from '../../shared/schemas/trade.schema'
import type { Transaction } from '../../shared/schemas/transaction.schema'
import type { Wallet } from '../../shared/schemas/wallet.schema'

export type BalanceTransaction = Pick<
  Transaction,
  'transactionType' | 'amount' | 'currency' | 'walletId' | 'toWalletId' | 'toAmount' | 'toCurrency'
>

export function getWalletBalanceDelta(transaction: BalanceTransaction, walletId: string): number {
  let delta = 0

  if (transaction.walletId === walletId) {
    if (transaction.transactionType === 'income') {
      delta += transaction.amount
    } else if (transaction.transactionType === 'expense' || transaction.transactionType === 'transfer') {
      delta -= transaction.amount
    }
  }

  if (transaction.toWalletId === walletId && transaction.transactionType === 'transfer') {
    if (transaction.currency === transaction.toCurrency) {
      delta += transaction.amount || 0
    } else {
      delta += transaction.toAmount || 0
    }
  }

  return delta
}

/**
 * Balance a wallet would end up with once `pending` is saved. `existing` is the
 * transaction being edited - its effect is already part of `currentBalance`, so
 * it has to come back out before the pending one goes in.
 */
export function projectWalletBalance(
  currentBalance: number,
  walletId: string,
  pending: BalanceTransaction | null,
  existing: BalanceTransaction | null
): number {
  const removed = existing ? getWalletBalanceDelta(existing, walletId) : 0
  const added = pending ? getWalletBalanceDelta(pending, walletId) : 0

  return Math.round((currentBalance - removed + added) * 100) / 100
}

export type CashWallet = Pick<Wallet, '_id' | 'currency'>
export type CashLinkedAccount = Pick<BrokerAccount, '_id' | 'cashWalletId'>
export type BalanceTrade = Pick<Trade, 'accountId' | 'amount' | 'currency'>

/**
 * What each broker's own rows have done to the wallet holding its cash.
 *
 * A statement is stored as trades, never as transactions - a buy is not a
 * grocery expense, and forty of them would bury the ledger the user actually
 * writes. But the money is gone from the account all the same, so a wallet
 * linked as a broker's cash has to answer for it, or it reads as everything
 * ever deposited rather than as what is left to buy something with.
 *
 * Derived here rather than mirrored into transactions, for the same reason
 * positions and cost basis are: the statement is the source, and re-importing
 * it must not be able to disagree with itself.
 *
 * Only rows in the wallet's own currency count. A wallet holds one, the
 * statement can move several, and converting a broker's USD dividend into a
 * EUR wallet at some rate would put a figure there that the broker never
 * states - which is exactly what the import's reconciliation refuses to do.
 */
export function computeBrokerCash(
  wallets: CashWallet[],
  accounts: CashLinkedAccount[],
  trades: BalanceTrade[]
): Map<string, number> {
  const walletsById = new Map(wallets.map(wallet => [wallet._id, wallet]))
  const walletOfAccount = new Map<string, CashWallet>()

  for (const account of accounts) {
    const wallet = account.cashWalletId ? walletsById.get(account.cashWalletId) : undefined
    if (wallet) walletOfAccount.set(account._id, wallet)
  }

  const cash = new Map<string, number>()

  for (const trade of trades) {
    const wallet = walletOfAccount.get(trade.accountId)
    if (!wallet || trade.currency !== wallet.currency) continue
    cash.set(wallet._id, (cash.get(wallet._id) ?? 0) + trade.amount)
  }

  return cash
}
