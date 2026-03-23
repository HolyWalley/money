import { db } from '../lib/db-dexie'
import { addSavingGoal, updateSavingGoal as updateSavingGoalCRDT, deleteSavingGoal } from '../lib/crdts'
import type { SavingGoal, CreateSavingGoal, UpdateSavingGoal } from '../../shared/schemas/saving-goal.schema'
import { createSavingGoalSchema, updateSavingGoalSchema } from '../../shared/schemas/saving-goal.schema'
import { transactionService } from './transactionService'

class SavingGoalService {
  async getAllGoals(): Promise<SavingGoal[]> {
    const dexieGoals = await db.savingGoals.orderBy('order').toArray()
    return dexieGoals.map(goal => ({
      ...goal,
      createdAt: goal.createdAt.toISOString(),
      updatedAt: goal.updatedAt.toISOString()
    })) as SavingGoal[]
  }

  async getGoalsByWallet(walletId: string): Promise<SavingGoal[]> {
    const dexieGoals = await db.savingGoals
      .where('walletId')
      .equals(walletId)
      .sortBy('order')
    return dexieGoals.map(goal => ({
      ...goal,
      createdAt: goal.createdAt.toISOString(),
      updatedAt: goal.updatedAt.toISOString()
    })) as SavingGoal[]
  }

  async getActiveGoalsByWallet(walletId: string): Promise<SavingGoal[]> {
    const goals = await this.getGoalsByWallet(walletId)
    return goals.filter(g => !g.achieved)
  }

  async createGoal(data: CreateSavingGoal): Promise<SavingGoal> {
    const validatedData = createSavingGoalSchema.parse(data)
    const maxOrder = await this.getMaxOrder(validatedData.walletId)

    const id = addSavingGoal({
      ...validatedData,
      allocatedAmount: 0,
      achieved: false,
      order: maxOrder + 1,
    })

    return {
      _id: id,
      ...validatedData,
      allocatedAmount: 0,
      achieved: false,
      order: maxOrder + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }

  async updateGoal(id: string, updates: UpdateSavingGoal): Promise<SavingGoal> {
    const validatedUpdates = updateSavingGoalSchema.parse(updates)
    const existing = await db.savingGoals.get(id)
    if (!existing) {
      throw new Error('Saving goal not found')
    }

    updateSavingGoalCRDT(id, validatedUpdates)

    return {
      ...existing,
      ...validatedUpdates,
      createdAt: existing.createdAt.toISOString(),
      updatedAt: new Date().toISOString(),
    } as SavingGoal
  }

  async deleteGoal(id: string): Promise<void> {
    deleteSavingGoal(id)
  }

  async allocateToGoals(allocations: { goalId: string; amount: number }[]): Promise<void> {
    for (const { goalId, amount } of allocations) {
      if (amount <= 0) continue

      const goal = await db.savingGoals.get(goalId)
      if (!goal) {
        throw new Error(`Saving goal ${goalId} not found`)
      }

      const remaining = goal.targetAmount - goal.allocatedAmount
      if (amount > remaining + 0.001) {
        throw new Error(`Allocation of ${amount} exceeds remaining capacity of ${remaining} for goal "${goal.name}"`)
      }

      const newAllocated = Math.min(goal.allocatedAmount + amount, goal.targetAmount)
      updateSavingGoalCRDT(goalId, { allocatedAmount: Math.round(newAllocated * 100) / 100 })
    }
  }

  async deallocateFromGoals(deallocations: { goalId: string; amount: number }[]): Promise<void> {
    for (const { goalId, amount } of deallocations) {
      if (amount <= 0) continue

      const goal = await db.savingGoals.get(goalId)
      if (!goal) {
        throw new Error(`Saving goal ${goalId} not found`)
      }

      if (amount > goal.allocatedAmount + 0.001) {
        throw new Error(`Deallocation of ${amount} exceeds allocated amount of ${goal.allocatedAmount} for goal "${goal.name}"`)
      }

      const newAllocated = Math.max(goal.allocatedAmount - amount, 0)
      updateSavingGoalCRDT(goalId, { allocatedAmount: Math.round(newAllocated * 100) / 100 })
    }
  }

  async deallocateEvenly(walletId: string, amount: number): Promise<{ goalId: string; amount: number }[]> {
    const goals = await this.getActiveGoalsByWallet(walletId)
    const goalsWithAllocation = goals.filter(g => g.allocatedAmount > 0)

    if (goalsWithAllocation.length === 0) return []

    const totalAllocated = goalsWithAllocation.reduce((sum, g) => sum + g.allocatedAmount, 0)
    const amountToDistribute = Math.min(amount, totalAllocated)

    const deallocations = goalsWithAllocation.map(goal => ({
      goalId: goal._id,
      amount: Math.round((goal.allocatedAmount / totalAllocated) * amountToDistribute * 100) / 100,
    }))

    const totalDistributed = deallocations.reduce((sum, d) => sum + d.amount, 0)
    const diff = Math.round((amountToDistribute - totalDistributed) * 100) / 100
    if (diff !== 0 && deallocations.length > 0) {
      deallocations[0].amount = Math.round((deallocations[0].amount + diff) * 100) / 100
    }

    await this.deallocateFromGoals(deallocations)
    return deallocations
  }

  async getUnallocatedAmount(walletId: string): Promise<number> {
    const balance = await transactionService.getWalletBalance(walletId)
    const goals = await this.getActiveGoalsByWallet(walletId)
    const totalAllocated = goals.reduce((sum, g) => sum + g.allocatedAmount, 0)
    return Math.round((balance - totalAllocated) * 100) / 100
  }

  private async getMaxOrder(walletId: string): Promise<number> {
    const goals = await db.savingGoals
      .where('walletId')
      .equals(walletId)
      .sortBy('order')
    return goals.length > 0 ? goals[goals.length - 1].order : -1
  }
}

export const savingGoalService = new SavingGoalService()
