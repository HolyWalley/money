import type { Transaction } from '../../shared/schemas/transaction.schema'

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
