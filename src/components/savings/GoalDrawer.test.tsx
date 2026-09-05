import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GoalDrawer } from './GoalDrawer'
import type { SavingGoal } from '../../../shared/schemas/saving-goal.schema'
import type { Wallet } from '../../../shared/schemas/wallet.schema'

const mocks = vi.hoisted(() => ({
  createGoal: vi.fn(async () => ({})),
  updateGoal: vi.fn(async () => ({})),
}))

vi.mock('@/services/savingGoalService', () => ({
  savingGoalService: {
    createGoal: mocks.createGoal,
    updateGoal: mocks.updateGoal,
  },
}))

const wallets: Wallet[] = [{
  _id: 'w-sav',
  type: 'wallet',
  name: 'Travel',
  currency: 'EUR',
  initialBalance: 0,
  isSavings: true,
  order: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}]

function makeGoal(overrides: Partial<SavingGoal> = {}): SavingGoal {
  return {
    _id: 'g1',
    walletId: 'w-sav',
    name: 'Travel',
    goalType: 'contribution',
    contributionAmount: 100,
    contributionPeriodType: 'weekly',
    contributionWeekDay: 1,
    allocatedAmount: 0,
    achieved: false,
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderDrawer(goal: SavingGoal | null) {
  render(
    <GoalDrawer open onOpenChange={vi.fn()} goal={goal} savingsWallets={wallets} />
  )
}

describe('GoalDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  })

  it('offers the goal type selector when creating a goal', () => {
    renderDrawer(null)

    expect(screen.getByLabelText('Goal Type')).toBeInTheDocument()
    expect(screen.getByLabelText('Target Amount')).toBeInTheDocument()
  })

  // goalType is immutable after creation: the CRDT cannot clear the fields the
  // abandoned shape leaves behind.
  it('hides the goal type selector when editing a goal', () => {
    renderDrawer(makeGoal())

    expect(screen.queryByLabelText('Goal Type')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Wallet')).not.toBeInTheDocument()
  })

  it('shows the contribution fields and no target fields for a contribution goal', () => {
    renderDrawer(makeGoal())

    expect(screen.getByLabelText('Contribution Amount')).toHaveValue(100)
    expect(screen.getByLabelText('Repeats')).toBeInTheDocument()
    expect(screen.queryByLabelText('Target Amount')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Deadline (optional)')).not.toBeInTheDocument()
  })

  it('shows the target fields for a target goal', () => {
    renderDrawer(makeGoal({
      goalType: 'target',
      targetAmount: 500,
      contributionAmount: undefined,
      contributionPeriodType: undefined,
      contributionWeekDay: undefined,
    }))

    expect(screen.getByLabelText('Target Amount')).toHaveValue(500)
    expect(screen.queryByLabelText('Contribution Amount')).not.toBeInTheDocument()
  })

  // Regression: a goal whose stored record still carries the anchor from a
  // previous cadence used to fail validation on every submit, so Update did
  // nothing at all and showed no message.
  it('still saves a contribution goal that stored a stale anchor from an old cadence', async () => {
    const user = userEvent.setup()
    renderDrawer(makeGoal({ contributionMonthDay: 15 }))

    await user.clear(screen.getByLabelText('Goal Name'))
    await user.type(screen.getByLabelText('Goal Name'), 'Travel fund')
    await user.click(screen.getByRole('button', { name: 'Update' }))

    await waitFor(() => expect(mocks.updateGoal).toHaveBeenCalledTimes(1))
    const [, patch] = mocks.updateGoal.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(patch.name).toBe('Travel fund')
    expect(patch.contributionMonthDay).toBeUndefined()
  })

  it('drops target fields left on a contribution goal record', async () => {
    const user = userEvent.setup()
    renderDrawer(makeGoal({ targetAmount: 500, targetDate: '2026-06-01T00:00:00.000Z' }))

    await user.click(screen.getByRole('button', { name: 'Update' }))

    await waitFor(() => expect(mocks.updateGoal).toHaveBeenCalledTimes(1))
    const [, patch] = mocks.updateGoal.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(patch.targetAmount).toBeUndefined()
    expect(patch.targetDate).toBeUndefined()
  })

  // Never let the submit button be a silent no-op.
  it('reports a validation failure instead of doing nothing', async () => {
    const user = userEvent.setup()
    renderDrawer(makeGoal())

    await user.clear(screen.getByLabelText('Goal Name'))
    await user.click(screen.getByRole('button', { name: 'Update' }))

    await waitFor(() => {
      expect(screen.getByText('Some fields are invalid. Please review the form and try again.')).toBeInTheDocument()
    })
    expect(mocks.updateGoal).not.toHaveBeenCalled()
  })
})
