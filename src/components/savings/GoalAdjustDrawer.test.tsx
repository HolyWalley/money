import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GoalAdjustDrawer } from './GoalAdjustDrawer'
import type { SavingGoal } from '../../../shared/schemas/saving-goal.schema'

const mocks = vi.hoisted(() => ({
  unallocated: 500,
  goals: [] as SavingGoal[],
  getActiveGoalsByWallet: vi.fn(),
  allocateToGoals: vi.fn(async () => undefined),
  deallocateFromGoals: vi.fn(async () => undefined),
  deallocateEvenly: vi.fn(async () => undefined),
}))

vi.mock('@/hooks/useUnallocatedAmount', () => ({
  useUnallocatedAmount: () => ({ unallocated: mocks.unallocated, isLoading: false }),
}))

vi.mock('@/services/savingGoalService', () => ({
  savingGoalService: {
    getActiveGoalsByWallet: mocks.getActiveGoalsByWallet,
    allocateToGoals: mocks.allocateToGoals,
    deallocateFromGoals: mocks.deallocateFromGoals,
    deallocateEvenly: mocks.deallocateEvenly,
  },
}))

function makeContributionGoal(overrides: Partial<SavingGoal> = {}): SavingGoal {
  return {
    _id: 'g-travel',
    walletId: 'w-sav',
    name: 'Travel',
    goalType: 'contribution',
    contributionAmount: 100,
    contributionPeriodType: 'monthly',
    contributionMonthDay: 1,
    allocatedAmount: 250,
    achieved: false,
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderDrawer() {
  render(<GoalAdjustDrawer open onOpenChange={vi.fn()} walletId="w-sav" currency="EUR" />)
}

describe('GoalAdjustDrawer with a contribution goal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.unallocated = 500
    mocks.getActiveGoalsByWallet.mockResolvedValue([makeContributionGoal()])
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

  // A contribution goal has no ceiling, so it is always allocatable and the
  // only bound on the slider is what is left to distribute.
  it('lists the goal and lets the slider run to the whole unallocated amount', async () => {
    renderDrawer()

    await screen.findByText('Travel')
    const slider = document.querySelector('input[type="range"]')
    expect(slider).toHaveAttribute('max', '500')
  })

  it('labels the row with the amount saved rather than a target', async () => {
    renderDrawer()

    expect(await screen.findByText('Saved: €250.00')).toBeInTheDocument()
    expect(screen.queryByText(/€250\.00 \//)).not.toBeInTheDocument()
  })

  it('enables Suggest with no target goal present', async () => {
    renderDrawer()

    await screen.findByText('Travel')
    expect(screen.getByRole('button', { name: 'Suggest' })).toBeEnabled()
  })

  it('suggests the goal own per-period contribution', async () => {
    const user = userEvent.setup()
    renderDrawer()

    await screen.findByText('Travel')
    await user.click(screen.getByRole('button', { name: 'Suggest' }))

    await waitFor(() => expect(screen.getByText('€100.00')).toBeInTheDocument())
  })

  it('caps the suggestion at what is left to distribute', async () => {
    mocks.unallocated = 40
    const user = userEvent.setup()
    renderDrawer()

    await screen.findByText('Travel')
    await user.click(screen.getByRole('button', { name: 'Suggest' }))

    await waitFor(() => expect(screen.getByText('€40.00')).toBeInTheDocument())
  })
})
