import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db-dexie'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import {
  computeSavingsSuggestionsByWallet,
  type WalletSavingsSuggestion,
} from '@/lib/savings-suggestion'
import type { SavingGoal } from '../../shared/schemas/saving-goal.schema'
import type { Transaction } from '../../shared/schemas/transaction.schema'

export function useSavingsSuggestions(periodStart: Date, periodEnd: Date) {
  const { wallets, isLoading: walletsLoading } = useLiveWallets()

  const goals = useLiveQuery<SavingGoal[]>(async () => {
    const dexieGoals = await db.savingGoals.toArray()
    return dexieGoals.map(goal => ({
      ...goal,
      targetDate: goal.targetDate ? goal.targetDate.toISOString() : undefined,
      createdAt: goal.createdAt.toISOString(),
      updatedAt: goal.updatedAt.toISOString(),
    })) as SavingGoal[]
  }, [])

  const transactions = useLiveQuery<Transaction[]>(
    async () => {
      const dexieTransactions = await db.transactions
        .where('date')
        .between(periodStart, periodEnd, true, true)
        .filter((t) => t.transactionType === 'transfer')
        .toArray()
      return dexieTransactions.map(tx => ({
        ...tx,
        date: tx.date.toISOString(),
        createdAt: tx.createdAt.toISOString(),
        updatedAt: tx.updatedAt.toISOString(),
      })) as Transaction[]
    },
    [periodStart, periodEnd],
  )

  const isLoading = walletsLoading || goals === undefined || transactions === undefined

  const suggestions = useMemo<WalletSavingsSuggestion[]>(() => {
    if (isLoading) return []
    return computeSavingsSuggestionsByWallet(
      wallets,
      goals ?? [],
      transactions ?? [],
      periodStart,
      periodEnd,
    )
  }, [wallets, goals, transactions, periodStart, periodEnd, isLoading])

  const totalsByCurrency = useMemo(() => {
    const totals = new Map<string, number>()
    for (const s of suggestions) {
      totals.set(s.currency, (totals.get(s.currency) ?? 0) + s.amount)
    }
    return totals
  }, [suggestions])

  return { suggestions, totalsByCurrency, isLoading }
}
