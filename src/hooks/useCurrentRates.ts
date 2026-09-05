import { useMemo } from 'react'
import { subDays } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'
import { useExchangeRates } from './useExchangeRates'
import { createConverter, RATE_LOOKBACK_DAYS, type Converter } from '@/lib/currency-conversion'

export interface CurrentRates {
  convert: Converter
  baseCurrency: string | undefined
  isLoading: boolean
}

/**
 * Converts today's money - balances, and payments still to come - into the base
 * currency, unlike `useDecoratedTransactions`, which converts each transaction
 * at the rate of the day it happened.
 */
export function useCurrentRates(currencies: string[]): CurrentRates {
  const { user } = useAuth()
  const baseCurrency = user?.settings?.defaultCurrency

  const targetKey = useMemo(
    () => [...new Set(currencies.filter(currency => currency && currency !== baseCurrency))].sort().join(','),
    [currencies, baseCurrency]
  )

  const targetCurrencies = useMemo(() => (targetKey ? targetKey.split(',') : []), [targetKey])

  // Pinned once rather than read from the clock on every render: the fetch keys
  // itself on the ISO string of the window it is handed, so a window that moves
  // every millisecond would never stop refetching.
  const asOf = useMemo(() => new Date(), [])
  const windowStart = useMemo(() => subDays(asOf, RATE_LOOKBACK_DAYS), [asOf])

  const { rates, isLoading } = useExchangeRates({
    baseCurrency,
    targetCurrencies,
    startDate: windowStart,
    endDate: asOf,
  })

  const convert = useMemo(
    () => createConverter(rates, baseCurrency, asOf),
    [rates, baseCurrency, asOf]
  )

  return {
    convert,
    baseCurrency,
    // Nothing foreign to convert means nothing to wait for.
    isLoading: targetCurrencies.length > 0 && isLoading,
  }
}
