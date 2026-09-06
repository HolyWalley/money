import { useMemo } from 'react'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { useLiveSavingGoals } from '@/hooks/useLiveSavingGoals'
import { useLiveTransactions } from '@/hooks/useLiveTransactions'
import {
  computeSavingsSuggestionsByWallet,
  type WalletSavingsSuggestion,
} from '@/lib/savings-suggestion'

const TRANSFERS = ['transfer']

export function useSavingsSuggestions(periodStart: Date, periodEnd: Date) {
  const wallets = useLiveWallets()
  const goals = useLiveSavingGoals()
  const transfers = useLiveTransactions({
    transactionTypeIds: TRANSFERS,
    period: { type: 'custom', customFrom: periodStart, customTo: periodEnd },
  })

  const suggestions = useMemo<WalletSavingsSuggestion[]>(
    () =>
      computeSavingsSuggestionsByWallet(
        wallets,
        goals,
        transfers,
        periodStart,
        periodEnd,
        undefined,
        { debug: true },
      ),
    [wallets, goals, transfers, periodStart, periodEnd],
  )

  const totalsByCurrency = useMemo(() => {
    const totals = new Map<string, number>()
    for (const s of suggestions) {
      totals.set(s.currency, (totals.get(s.currency) ?? 0) + s.amount)
    }
    return totals
  }, [suggestions])

  return { suggestions, totalsByCurrency }
}
