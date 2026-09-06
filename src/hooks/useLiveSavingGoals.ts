import { useMemo } from 'react'
import { db } from '@/lib/db-dexie'
import { documentReady } from '@/lib/document-ready'
import { createSharedLiveQuery } from '@/lib/shared-live-query'
import type { SavingGoal } from '../../shared/schemas/saving-goal.schema'

export const savingGoalsStore = createSharedLiveQuery(async () => {
  const dexieGoals = await db.savingGoals.orderBy('order').toArray()

  return dexieGoals.map(goal => ({
    ...goal,
    targetDate: goal.targetDate ? goal.targetDate.toISOString() : undefined,
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString()
  })) as SavingGoal[]
}, { after: documentReady, name: 'saving goals' })

export function useLiveSavingGoals(walletId?: string): SavingGoal[] {
  const goals = savingGoalsStore()

  return useMemo(
    () => (walletId ? goals.filter(goal => goal.walletId === walletId) : goals),
    [goals, walletId]
  )
}
