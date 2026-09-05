import { getEffectiveAmount } from './transaction-utils'
import type { DecoratedTransaction } from '@/hooks/useDecoratedTransactions'

export interface CashflowSummary {
  income: number
  expense: number
  cashFlow: number
  expensesByCategory: Map<string, number>
}

export const EMPTY_CASHFLOW: CashflowSummary = {
  income: 0,
  expense: 0,
  cashFlow: 0,
  expensesByCategory: new Map(),
}

/**
 * What a set of transactions did to the money, in the base currency.
 *
 * Shared by the headline figures, the period they are compared against and
 * every bar of the trend: totals computed three different ways would make the
 * deltas between them meaningless.
 */
export function summarizeCashflow(transactions: DecoratedTransaction[]): CashflowSummary {
  let income = 0
  let expense = 0
  const expensesByCategory = new Map<string, number>()

  for (const transaction of transactions) {
    if (transaction.amountInBaseCurrency === null) continue

    if (transaction.transactionType === 'income') {
      // Money coming back is not money earned.
      if (transaction.reimbursement) continue
      income += transaction.amountInBaseCurrency
      continue
    }

    if (transaction.transactionType !== 'expense') continue

    // Only your share of a split is yours to have spent.
    const effectiveAmount = getEffectiveAmount(transaction)
    if (effectiveAmount === null) continue

    expense += effectiveAmount

    if (transaction.categoryId) {
      const current = expensesByCategory.get(transaction.categoryId) || 0
      expensesByCategory.set(transaction.categoryId, current + effectiveAmount)
    }
  }

  return {
    income,
    expense,
    cashFlow: income - expense,
    expensesByCategory,
  }
}
