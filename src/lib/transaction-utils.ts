import type { DecoratedTransaction } from '@/hooks/useDecoratedTransactions'

export function getEffectiveAmount(transaction: DecoratedTransaction): number | null {
  if (transaction.amountInBaseCurrency === null) {
    return null
  }

  if (!transaction.split || !transaction.parts || transaction.parts.length === 0) {
    return transaction.amountInBaseCurrency
  }

  const myPortion = transaction.parts[0]?.amount ?? 0
  const totalAmount = transaction.amount

  if (totalAmount === 0) {
    return transaction.amountInBaseCurrency
  }

  const ratio = myPortion / totalAmount

  return transaction.amountInBaseCurrency * ratio
}
