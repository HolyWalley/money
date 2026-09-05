import { useMemo } from 'react'
import { useUpcomingPayments } from './useUpcomingPayments'
import { useSavingsSuggestions } from './useSavingsSuggestions'
import { useCurrentRates } from './useCurrentRates'
import { sumToBase } from '@/lib/currency-conversion'

export interface PeriodCommitments {
  /** Recurring payments not yet logged, already net of what is saved for them. */
  recurring: number
  /** Transfers into savings the period still owes. */
  savings: number
  total: number
  missingCurrencies: string[]
  isLoading: boolean
}

/**
 * What the period has already promised but not yet paid.
 *
 * The two halves never overlap: a recurring payment's saved portion comes out
 * of a savings wallet and is netted out upstream, so what is left here is what
 * a spendable wallet still has to cover.
 */
export function usePeriodCommitments(periodStart: Date, periodEnd: Date): PeriodCommitments {
  const { totalsByCurrency: recurringTotals, isLoading: isLoadingRecurring } = useUpcomingPayments(
    periodStart,
    periodEnd
  )
  const { totalsByCurrency: savingsTotals, isLoading: isLoadingSavings } = useSavingsSuggestions(
    periodStart,
    periodEnd
  )

  const currencies = useMemo(
    () => [...new Set([...recurringTotals.keys(), ...savingsTotals.keys()])],
    [recurringTotals, savingsTotals]
  )

  const { convert, isLoading: isLoadingRates } = useCurrentRates(currencies)

  const recurring = useMemo(() => sumToBase(recurringTotals, convert), [recurringTotals, convert])
  const savings = useMemo(() => sumToBase(savingsTotals, convert), [savingsTotals, convert])

  const missingCurrencies = useMemo(
    () => [...new Set([...recurring.missingCurrencies, ...savings.missingCurrencies])].sort(),
    [recurring.missingCurrencies, savings.missingCurrencies]
  )

  return {
    recurring: recurring.total,
    savings: savings.total,
    total: recurring.total + savings.total,
    missingCurrencies,
    isLoading: isLoadingRecurring || isLoadingSavings || isLoadingRates,
  }
}
