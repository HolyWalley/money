import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { deferred, type Deferred } from '@/lib/suspense'
import { GoalAdjustDrawer } from './GoalAdjustDrawer'
import type { SavingGoal } from '../../../shared/schemas/saving-goal.schema'

const mocks = vi.hoisted(() => ({
  unallocated: 500,
  goals: [] as SavingGoal[],
  // Set to read the way the real hook does, suspending until the store answers.
  pendingGoals: null as Promise<SavingGoal[]> | null,
  allocateToGoals: vi.fn(async () => undefined),
  deallocateFromGoals: vi.fn(async () => undefined),
  deallocateEvenly: vi.fn(async () => undefined),
}))

vi.mock('@/hooks/useUnallocatedAmount', () => ({
  useUnallocatedAmount: () => ({ unallocated: mocks.unallocated }),
}))

vi.mock('@/hooks/useLiveSavingGoals', async () => {
  const { use } = await import('react')
  return {
    useLiveSavingGoals: () => (mocks.pendingGoals ? use(mocks.pendingGoals) : mocks.goals),
  }
})

vi.mock('@/services/savingGoalService', () => ({
  savingGoalService: {
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
  return render(<GoalAdjustDrawer open onOpenChange={vi.fn()} walletId="w-sav" currency="EUR" />)
}

// The slider commits a state update a microtask after mount; a test that
// asserts synchronously must still let it land inside act before teardown.
function settle() {
  return act(async () => {})
}

describe('GoalAdjustDrawer with a contribution goal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.unallocated = 500
    mocks.goals = [makeContributionGoal()]
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

  // The goals come from the live list, so an open lands on them at once
  // rather than on "Nothing to adjust" while a read is in flight.
  it('opens straight onto the goal', async () => {
    renderDrawer()

    expect(screen.getByText('Travel')).toBeInTheDocument()
    expect(screen.queryByText('Nothing to adjust right now.')).not.toBeInTheDocument()
    await settle()
  })

  it('leaves an achieved goal out', async () => {
    mocks.goals = [
      makeContributionGoal(),
      makeContributionGoal({ _id: 'g-done', name: 'Done', achieved: true }),
    ]
    renderDrawer()

    expect(screen.getByText('Travel')).toBeInTheDocument()
    expect(screen.queryByText('Done')).not.toBeInTheDocument()
    await settle()
  })

  // The sliders are bounded by the goals as they were when the drawer opened;
  // a goal that lands mid-drag must not move them.
  it('keeps the goals it opened with while the live list changes', async () => {
    const { rerender } = renderDrawer()

    mocks.goals = [makeContributionGoal({ _id: 'g-car', name: 'Car' })]
    rerender(<GoalAdjustDrawer open onOpenChange={vi.fn()} walletId="w-sav" currency="EUR" />)

    expect(screen.getByText('Travel')).toBeInTheDocument()
    expect(screen.queryByText('Car')).not.toBeInTheDocument()
    await settle()
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

describe('GoalAdjustDrawer while the goals are on their way', () => {
  let goals: Deferred<SavingGoal[]>

  beforeEach(() => {
    mocks.unallocated = 500
    goals = deferred<SavingGoal[]>()
    mocks.pendingGoals = goals.promise
  })

  afterEach(() => {
    mocks.pendingGoals = null
  })

  it('opens at once and spins until the goals answer', async () => {
    await act(async () => {
      renderDrawer()
    })

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    expect(screen.queryByText('Travel')).not.toBeInTheDocument()

    await act(async () => {
      goals.resolve([makeContributionGoal()])
    })

    expect(screen.getByText('Travel')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await settle()
  })

  it('shows a failed read inside the drawer', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    goals.reject(new Error('index missing'))

    await act(async () => {
      renderDrawer()
    })

    expect(screen.getByRole('alert')).toHaveTextContent('This could not be read')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    consoleError.mockRestore()
  })
})
