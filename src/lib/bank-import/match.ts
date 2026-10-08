import { differenceInCalendarDays } from 'date-fns'
import type { Transaction } from '../../../shared/schemas/transaction.schema'
import { accountWalletKey, type BankOperation } from './types'

/** How many calendar days a hand-entered date may sit from the bank's and still be the same payment. */
export const MATCH_WINDOW_DAYS = 1

export interface ReviewItem {
  operation: BankOperation
  /** The wallet this bank account was imported into before, if it still exists. */
  walletId?: string
  /** The wallet the other side of an exchange was imported into before. */
  toWalletId?: string
  /** A hand-entered transaction that looks like this operation. */
  matchedTransactionId?: string
}

export interface ReviewContext {
  transactions: Transaction[]
  accountWallets: Record<string, string>
  dismissed: string[]
  walletIds: string[]
}

/** The wallet, amount and currency `transaction` moved in `direction`, or null if it moved nothing that way. */
function effectOn(transaction: Transaction, direction: BankOperation['direction']) {
  if (transaction.transactionType === direction) {
    return { walletId: transaction.walletId, amount: transaction.amount, currency: transaction.currency }
  }
  if (transaction.transactionType !== 'transfer') return null
  if (direction === 'expense') {
    return { walletId: transaction.walletId, amount: transaction.amount, currency: transaction.currency }
  }
  if (!transaction.toWalletId) return null
  return {
    walletId: transaction.toWalletId,
    amount: transaction.toAmount ?? transaction.amount,
    currency: transaction.toCurrency ?? transaction.currency,
  }
}

/**
 * Drops what was already imported or dismissed, and pairs the rest with
 * hand-entered transactions that look like them.
 *
 * A transaction is paired at most once, so two identical transfers against one
 * hand-entered record leave the second as new rather than hiding both.
 */
export function reviewOperations(operations: BankOperation[], context: ReviewContext): ReviewItem[] {
  const known = new Set<string>(context.dismissed)
  for (const transaction of context.transactions) {
    if (transaction.externalId) known.add(transaction.externalId)
  }

  const walletIds = new Set(context.walletIds)
  const rememberedWallet = (key: string) => {
    const mapped = context.accountWallets[key]
    return mapped && walletIds.has(mapped) ? mapped : undefined
  }
  const candidates = context.transactions.filter((transaction) => !transaction.externalId)
  const claimed = new Set<string>()
  const items: ReviewItem[] = []

  for (const operation of operations) {
    if (known.has(operation.externalId)) continue

    const walletId = rememberedWallet(accountWalletKey(operation))
    const toWalletId = operation.received ? rememberedWallet(accountWalletKey(operation.received)) : undefined
    const at = new Date(operation.date)

    let best: { id: string; distance: number } | null = null
    for (const transaction of candidates) {
      if (claimed.has(transaction._id)) continue
      const effect = effectOn(transaction, operation.direction)
      if (!effect || effect.amount !== operation.amount || effect.currency !== operation.currency) continue
      if (walletId && effect.walletId !== walletId) continue

      const date = new Date(transaction.date)
      if (Math.abs(differenceInCalendarDays(date, at)) > MATCH_WINDOW_DAYS) continue
      const distance = Math.abs(date.getTime() - at.getTime())
      if (!best || distance < best.distance) best = { id: transaction._id, distance }
    }

    if (best) claimed.add(best.id)
    items.push({ operation, walletId, toWalletId, matchedTransactionId: best?.id })
  }

  return items
}
