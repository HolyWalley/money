import { useMemo } from 'react'
import { type Transaction } from '../../shared/schemas/transaction.schema'
import { useLiveTransactions, type TransactionFilters } from './useLiveTransactions'
import { useExchangeRates } from './useExchangeRates'
import { useAuth } from '@/contexts/AuthContext'
import { findRate } from '@/lib/currency-conversion'

export interface DecoratedTransaction extends Transaction {
  amountInBaseCurrency: number | null
}

export function useDecoratedTransactions(filters: TransactionFilters | null): DecoratedTransaction[] {
  const { user } = useAuth()
  const baseCurrency = user?.settings?.defaultCurrency
  const transactions = useLiveTransactions(filters)

  // Extract unique currencies and date range from transactions
  const { targetCurrencies, startDate, endDate } = useMemo(() => {
    if (!transactions.length || !baseCurrency) {
      return { targetCurrencies: [], startDate: undefined, endDate: undefined }
    }

    const currencies = new Set<string>()
    let minDate = new Date(transactions[0].date)
    let maxDate = new Date(transactions[0].date)

    transactions.forEach(t => {
      const txDate = new Date(t.date)
      if (txDate < minDate) minDate = txDate
      if (txDate > maxDate) maxDate = txDate

      if (t.currency && t.currency !== baseCurrency) {
        currencies.add(t.currency)
      }
      // For transfers with different currency
      if (t.toCurrency && t.toCurrency !== baseCurrency && t.toCurrency !== t.currency) {
        currencies.add(t.toCurrency)
      }
    })

    return {
      targetCurrencies: Array.from(currencies),
      startDate: minDate,
      endDate: maxDate,
    }
  }, [transactions, baseCurrency])

  const rates = useExchangeRates({
    baseCurrency,
    targetCurrencies,
    startDate,
    endDate,
  })

  return useMemo(() => {
    if (!baseCurrency) {
      return transactions.map(t => ({ ...t, amountInBaseCurrency: null }))
    }

    return transactions.map(transaction => {
      // If transaction is already in base currency, use the amount directly
      if (transaction.currency === baseCurrency) {
        return {
          ...transaction,
          amountInBaseCurrency: transaction.amount,
        }
      }

      // The nearest rate on or before the day, not that day's key alone: today's
      // rate is regularly not published yet, and a row must not read as
      // unconverted first and as a number a moment later.
      const rate = findRate(rates, baseCurrency, transaction.currency, new Date(transaction.date))

      if (rate === null) {
        return {
          ...transaction,
          amountInBaseCurrency: null,
        }
      }

      // Inverse the rate: if 1 PLN = 0.23 EUR, then 1 EUR = 1/0.23 PLN
      return {
        ...transaction,
        amountInBaseCurrency: transaction.amount / rate,
      }
    })
  }, [transactions, baseCurrency, rates])
}
