import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db-dexie'
import type { SavingGoal } from '../../shared/schemas/saving-goal.schema'

export function useLiveSavingGoals(walletId?: string) {
  const goals = useLiveQuery(async () => {
    const query = walletId
      ? db.savingGoals.where('walletId').equals(walletId)
      : db.savingGoals.orderBy('order')

    const dexieGoals = walletId
      ? await query.sortBy('order')
      : await query.toArray()

    return dexieGoals.map(goal => ({
      ...goal,
      createdAt: goal.createdAt.toISOString(),
      updatedAt: goal.updatedAt.toISOString()
    })) as SavingGoal[]
  }, [walletId])

  return {
    goals: goals || [],
    isLoading: goals === undefined,
  }
}
