import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockWhere = vi.fn()
const mockEquals = vi.fn()
const mockSortBy = vi.fn()
const mockOrderBy = vi.fn()
const mockToArray = vi.fn()

vi.mock('../lib/db-dexie', () => ({
  db: {
    savingGoals: {
      get: (...args: unknown[]) => mockGet(...args),
      where: (...args: unknown[]) => mockWhere(...args),
      orderBy: (...args: unknown[]) => mockOrderBy(...args),
    },
  },
}))

const mockAddSavingGoal = vi.fn().mockReturnValue('new-goal-id')
const mockUpdateSavingGoalCRDT = vi.fn()
const mockDeleteSavingGoal = vi.fn()

vi.mock('../lib/crdts', () => ({
  addSavingGoal: (...args: unknown[]) => mockAddSavingGoal(...args),
  updateSavingGoal: (...args: unknown[]) => mockUpdateSavingGoalCRDT(...args),
  deleteSavingGoal: (...args: unknown[]) => mockDeleteSavingGoal(...args),
}))

const mockGetWalletBalance = vi.fn()

vi.mock('./transactionService', () => ({
  transactionService: {
    getWalletBalance: (...args: unknown[]) => mockGetWalletBalance(...args),
  },
}))

import { savingGoalService } from './savingGoalService'

function makeDexieGoal(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'goal-1',
    walletId: 'wallet-1',
    name: 'Camera',
    goalType: 'target',
    targetAmount: 500,
    allocatedAmount: 100,
    achieved: false,
    order: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

function makeContributionGoal(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'goal-c',
    walletId: 'wallet-1',
    name: 'Travel',
    goalType: 'contribution',
    contributionAmount: 100,
    contributionPeriodType: 'monthly',
    contributionMonthDay: 1,
    allocatedAmount: 0,
    achieved: false,
    order: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockWhere.mockReturnValue({ equals: mockEquals })
  mockEquals.mockReturnValue({ sortBy: mockSortBy })
  mockOrderBy.mockReturnValue({ toArray: mockToArray })
})

describe('savingGoalService', () => {
  describe('createGoal', () => {
    it('creates a goal with correct defaults', async () => {
      mockSortBy.mockResolvedValue([])

      const result = await savingGoalService.createGoal({
        walletId: 'wallet-1',
        name: 'New Camera',
        goalType: 'target',
        targetAmount: 500,
      })

      expect(mockAddSavingGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          walletId: 'wallet-1',
          name: 'New Camera',
          targetAmount: 500,
          allocatedAmount: 0,
          achieved: false,
          order: 0,
        })
      )
      expect(result._id).toBe('new-goal-id')
      expect(result.allocatedAmount).toBe(0)
      expect(result.achieved).toBe(false)
    })

    it('defaults goalType to target when it is not supplied', async () => {
      mockSortBy.mockResolvedValue([])

      await savingGoalService.createGoal({
        walletId: 'wallet-1',
        name: 'Legacy Shape',
        targetAmount: 500,
      } as Parameters<typeof savingGoalService.createGoal>[0])

      expect(mockAddSavingGoal).toHaveBeenCalledWith(
        expect.objectContaining({ goalType: 'target' })
      )
    })

    it('passes contribution fields through to the CRDT layer', async () => {
      mockSortBy.mockResolvedValue([])

      const result = await savingGoalService.createGoal({
        walletId: 'wallet-1',
        name: 'Travel',
        goalType: 'contribution',
        contributionAmount: 100,
        contributionPeriodType: 'monthly',
        contributionMonthDay: 15,
      })

      expect(mockAddSavingGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          walletId: 'wallet-1',
          name: 'Travel',
          goalType: 'contribution',
          contributionAmount: 100,
          contributionPeriodType: 'monthly',
          contributionMonthDay: 15,
          allocatedAmount: 0,
          achieved: false,
          order: 0,
        })
      )
      expect(result.goalType).toBe('contribution')
      expect(result.contributionAmount).toBe(100)
      expect(result.targetAmount).toBeUndefined()
    })

    it('rejects a contribution goal without a cadence', async () => {
      mockSortBy.mockResolvedValue([])

      await expect(
        savingGoalService.createGoal({
          walletId: 'wallet-1',
          name: 'Travel',
          goalType: 'contribution',
          contributionAmount: 100,
        })
      ).rejects.toThrow()

      expect(mockAddSavingGoal).not.toHaveBeenCalled()
    })
  })

  describe('allocateToGoals', () => {
    it('allocates amount to a goal', async () => {
      mockGet.mockResolvedValue(makeDexieGoal({ allocatedAmount: 100 }))

      await savingGoalService.allocateToGoals([
        { goalId: 'goal-1', amount: 50 },
      ])

      expect(mockUpdateSavingGoalCRDT).toHaveBeenCalledWith('goal-1', { allocatedAmount: 150 })
    })

    it('caps allocation at target amount', async () => {
      mockGet.mockResolvedValue(makeDexieGoal({ allocatedAmount: 480 }))

      await savingGoalService.allocateToGoals([
        { goalId: 'goal-1', amount: 20 },
      ])

      expect(mockUpdateSavingGoalCRDT).toHaveBeenCalledWith('goal-1', { allocatedAmount: 500 })
    })

    it('rejects allocation exceeding remaining capacity', async () => {
      mockGet.mockResolvedValue(makeDexieGoal({ allocatedAmount: 480 }))

      await expect(
        savingGoalService.allocateToGoals([
          { goalId: 'goal-1', amount: 25 },
        ])
      ).rejects.toThrow('exceeds remaining capacity')
    })

    it('allocates to multiple goals', async () => {
      mockGet
        .mockResolvedValueOnce(makeDexieGoal({ _id: 'goal-1', allocatedAmount: 100, targetAmount: 500 }))
        .mockResolvedValueOnce(makeDexieGoal({ _id: 'goal-2', allocatedAmount: 200, targetAmount: 1000 }))

      await savingGoalService.allocateToGoals([
        { goalId: 'goal-1', amount: 50 },
        { goalId: 'goal-2', amount: 100 },
      ])

      expect(mockUpdateSavingGoalCRDT).toHaveBeenCalledTimes(2)
      expect(mockUpdateSavingGoalCRDT).toHaveBeenCalledWith('goal-1', { allocatedAmount: 150 })
      expect(mockUpdateSavingGoalCRDT).toHaveBeenCalledWith('goal-2', { allocatedAmount: 300 })
    })

    it('skips zero-amount allocations', async () => {
      await savingGoalService.allocateToGoals([
        { goalId: 'goal-1', amount: 0 },
      ])

      expect(mockGet).not.toHaveBeenCalled()
      expect(mockUpdateSavingGoalCRDT).not.toHaveBeenCalled()
    })

    it('throws for non-existent goal', async () => {
      mockGet.mockResolvedValue(undefined)

      await expect(
        savingGoalService.allocateToGoals([
          { goalId: 'nonexistent', amount: 50 },
        ])
      ).rejects.toThrow('not found')
    })

    it('allocates to a contribution goal with no ceiling', async () => {
      mockGet.mockResolvedValue(makeContributionGoal({ allocatedAmount: 0 }))

      await savingGoalService.allocateToGoals([
        { goalId: 'goal-c', amount: 100 },
      ])

      expect(mockUpdateSavingGoalCRDT).toHaveBeenCalledWith('goal-c', { allocatedAmount: 100 })
    })

    it('lets a contribution goal grow past its per-period amount', async () => {
      mockGet.mockResolvedValue(makeContributionGoal({ allocatedAmount: 1200, contributionAmount: 100 }))

      await savingGoalService.allocateToGoals([
        { goalId: 'goal-c', amount: 100 },
      ])

      expect(mockUpdateSavingGoalCRDT).toHaveBeenCalledWith('goal-c', { allocatedAmount: 1300 })
    })

    it('never throws a capacity error for a contribution goal', async () => {
      mockGet.mockResolvedValue(makeContributionGoal({ allocatedAmount: 50 }))

      await expect(
        savingGoalService.allocateToGoals([
          { goalId: 'goal-c', amount: 100000 },
        ])
      ).resolves.toBeUndefined()

      expect(mockUpdateSavingGoalCRDT).toHaveBeenCalledWith('goal-c', { allocatedAmount: 100050 })
    })

    it('rounds a contribution allocation to two decimals', async () => {
      mockGet.mockResolvedValue(makeContributionGoal({ allocatedAmount: 0.1 }))

      await savingGoalService.allocateToGoals([
        { goalId: 'goal-c', amount: 0.2 },
      ])

      expect(mockUpdateSavingGoalCRDT).toHaveBeenCalledWith('goal-c', { allocatedAmount: 0.3 })
    })

    it('still caps a target goal when mixed with a contribution goal', async () => {
      mockGet
        .mockResolvedValueOnce(makeContributionGoal({ _id: 'goal-c', allocatedAmount: 0 }))
        .mockResolvedValueOnce(makeDexieGoal({ _id: 'goal-1', allocatedAmount: 480, targetAmount: 500 }))

      await savingGoalService.allocateToGoals([
        { goalId: 'goal-c', amount: 999 },
        { goalId: 'goal-1', amount: 20 },
      ])

      expect(mockUpdateSavingGoalCRDT).toHaveBeenCalledWith('goal-c', { allocatedAmount: 999 })
      expect(mockUpdateSavingGoalCRDT).toHaveBeenCalledWith('goal-1', { allocatedAmount: 500 })
    })
  })

  describe('deallocateFromGoals', () => {
    it('deallocates amount from a goal', async () => {
      mockGet.mockResolvedValue(makeDexieGoal({ allocatedAmount: 100 }))

      await savingGoalService.deallocateFromGoals([
        { goalId: 'goal-1', amount: 30 },
      ])

      expect(mockUpdateSavingGoalCRDT).toHaveBeenCalledWith('goal-1', { allocatedAmount: 70 })
    })

    it('does not go below zero', async () => {
      mockGet.mockResolvedValue(makeDexieGoal({ allocatedAmount: 100 }))

      await savingGoalService.deallocateFromGoals([
        { goalId: 'goal-1', amount: 100 },
      ])

      expect(mockUpdateSavingGoalCRDT).toHaveBeenCalledWith('goal-1', { allocatedAmount: 0 })
    })

    it('rejects deallocation exceeding allocated amount', async () => {
      mockGet.mockResolvedValue(makeDexieGoal({ allocatedAmount: 50 }))

      await expect(
        savingGoalService.deallocateFromGoals([
          { goalId: 'goal-1', amount: 60 },
        ])
      ).rejects.toThrow('exceeds allocated amount')
    })

    it('deallocates from a contribution goal', async () => {
      mockGet.mockResolvedValue(makeContributionGoal({ allocatedAmount: 300 }))

      await savingGoalService.deallocateFromGoals([
        { goalId: 'goal-c', amount: 100 },
      ])

      expect(mockUpdateSavingGoalCRDT).toHaveBeenCalledWith('goal-c', { allocatedAmount: 200 })
    })

    it('skips zero-amount deallocations', async () => {
      await savingGoalService.deallocateFromGoals([
        { goalId: 'goal-1', amount: 0 },
      ])

      expect(mockGet).not.toHaveBeenCalled()
    })
  })

  describe('deallocateEvenly', () => {
    it('distributes deallocation proportionally', async () => {
      const goals = [
        makeDexieGoal({ _id: 'goal-1', allocatedAmount: 300, targetAmount: 500, createdAt: new Date(), updatedAt: new Date() }),
        makeDexieGoal({ _id: 'goal-2', allocatedAmount: 100, targetAmount: 300, createdAt: new Date(), updatedAt: new Date() }),
      ]
      mockSortBy.mockResolvedValue(goals)

      mockGet
        .mockResolvedValueOnce(goals[0])
        .mockResolvedValueOnce(goals[1])

      const result = await savingGoalService.deallocateEvenly('wallet-1', 100)

      expect(result).toHaveLength(2)
      const totalDeallocated = result.reduce((sum, d) => sum + d.amount, 0)
      expect(totalDeallocated).toBe(100)

      const goal1Dealloc = result.find(d => d.goalId === 'goal-1')
      const goal2Dealloc = result.find(d => d.goalId === 'goal-2')
      expect(goal1Dealloc!.amount).toBe(75)
      expect(goal2Dealloc!.amount).toBe(25)
    })

    it('returns empty array when no goals have allocations', async () => {
      mockSortBy.mockResolvedValue([
        makeDexieGoal({ allocatedAmount: 0 }),
      ])

      const result = await savingGoalService.deallocateEvenly('wallet-1', 100)
      expect(result).toEqual([])
    })

    it('caps deallocation at total allocated', async () => {
      const goals = [
        makeDexieGoal({ _id: 'goal-1', allocatedAmount: 50, createdAt: new Date(), updatedAt: new Date() }),
      ]
      mockSortBy.mockResolvedValue(goals)
      mockGet.mockResolvedValue(goals[0])

      const result = await savingGoalService.deallocateEvenly('wallet-1', 200)

      expect(result[0].amount).toBe(50)
    })
  })

  describe('getUnallocatedAmount', () => {
    it('returns balance minus total allocated', async () => {
      mockGetWalletBalance.mockResolvedValue(1000)
      mockSortBy.mockResolvedValue([
        makeDexieGoal({ allocatedAmount: 200, achieved: false, createdAt: new Date(), updatedAt: new Date() }),
        makeDexieGoal({ allocatedAmount: 300, achieved: false, createdAt: new Date(), updatedAt: new Date() }),
      ])

      const result = await savingGoalService.getUnallocatedAmount('wallet-1')
      expect(result).toBe(500)
    })

    it('excludes achieved goals from calculation', async () => {
      mockGetWalletBalance.mockResolvedValue(1000)
      mockSortBy.mockResolvedValue([
        makeDexieGoal({ allocatedAmount: 200, achieved: false, createdAt: new Date(), updatedAt: new Date() }),
        makeDexieGoal({ allocatedAmount: 300, achieved: true, createdAt: new Date(), updatedAt: new Date() }),
      ])

      const result = await savingGoalService.getUnallocatedAmount('wallet-1')
      expect(result).toBe(800)
    })

    it('returns negative when allocations exceed balance', async () => {
      mockGetWalletBalance.mockResolvedValue(100)
      mockSortBy.mockResolvedValue([
        makeDexieGoal({ allocatedAmount: 200, achieved: false, createdAt: new Date(), updatedAt: new Date() }),
      ])

      const result = await savingGoalService.getUnallocatedAmount('wallet-1')
      expect(result).toBe(-100)
    })
  })
})
