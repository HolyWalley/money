import { useMemo } from 'react'
import { subDays } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'
import { preloadExchangeRates, useExchangeRates, type UseExchangeRatesParams } from './useExchangeRates'
import { createConverter, RATE_LOOKBACK_DAYS, type Converter } from '@/lib/currency-conversion'

export interface CurrentRates {
  convert: Converter
  baseCurrency: string | undefined
}

interface RatesWindow extends UseExchangeRatesParams {
  startDate: Date
  endDate: Date
}

/** The base currency, the currencies worth asking about, and today's window. */
function useRatesWindow(currencies: string[]): RatesWindow {
  const { user } = useAuth()
  const baseCurrency = user?.settings?.defaultCurrency

  const targetKey = useMemo(
    () => [...new Set(currencies.filter(currency => currency && currency !== baseCurrency))].sort().join(','),
    [currencies, baseCurrency]
  )

  const targetCurrencies = useMemo(() => (targetKey ? targetKey.split(',') : []), [targetKey])

  // Pinned once rather than read from the clock on every render, so the window
  // and the converter built on it hold still across renders.
  const asOf = useMemo(() => new Date(), [])
  const windowStart = useMemo(() => subDays(asOf, RATE_LOOKBACK_DAYS), [asOf])

  return { baseCurrency, targetCurrencies, startDate: windowStart, endDate: asOf }
}

/**
 * Converts today's money - balances, and payments still to come - into the base
 * currency, unlike `useDecoratedTransactions`, which converts each transaction
 * at the rate of the day it happened.
 */
export function useCurrentRates(currencies: string[]): CurrentRates {
  const { baseCurrency, targetCurrencies, startDate, endDate } = useRatesWindow(currencies)

  const rates = useExchangeRates({ baseCurrency, targetCurrencies, startDate, endDate })

  const convert = useMemo(
    () => createConverter(rates, baseCurrency, endDate),
    [rates, baseCurrency, endDate]
  )

  return { convert, baseCurrency }
}

/**
 * Starts the read `useCurrentRates(currencies)` will make, from above the hook
 * that will make it: the window is keyed by UTC day, so the two share an entry.
 */
export function usePreloadCurrentRates(currencies: string[]): void {
  const params = useRatesWindow(currencies)
  preloadExchangeRates(params)
}
