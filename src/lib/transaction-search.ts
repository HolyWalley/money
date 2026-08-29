import type { Transaction } from '../../shared/schemas/transaction.schema'

type SearchableTransaction = Pick<Transaction, 'note' | 'amount' | 'toAmount'>

// A query counts as a price only when it is nothing but a number, so a note
// like "12 pack" is still searched as the text it was typed as.
const AMOUNT_QUERY = /^\d+([.,]\d*)?$/

function matchesAmount(amount: number | undefined, query: string): boolean {
  if (amount === undefined) {
    return false
  }

  // Matched as a prefix: looking for 12.50 should not mean typing all of it
  // before the row shows up.
  return amount.toFixed(2).startsWith(query) || String(amount).startsWith(query)
}

export function matchesSearch(transaction: SearchableTransaction, query: string): boolean {
  const term = query.trim().toLowerCase()

  if (!term) {
    return true
  }

  if (transaction.note?.toLowerCase().includes(term)) {
    return true
  }

  if (!AMOUNT_QUERY.test(term)) {
    return false
  }

  const amountQuery = term.replace(',', '.')

  return matchesAmount(transaction.amount, amountQuery) || matchesAmount(transaction.toAmount, amountQuery)
}

export function searchTransactions<T extends SearchableTransaction>(transactions: T[], query: string): T[] {
  if (!query.trim()) {
    return transactions
  }

  return transactions.filter(transaction => matchesSearch(transaction, query))
}
