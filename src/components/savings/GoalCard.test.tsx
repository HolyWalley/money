import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { GoalCard } from './GoalCard'
import type { SavingGoal } from '../../../shared/schemas/saving-goal.schema'

vi.mock('@/services/savingGoalService', () => ({
  savingGoalService: {
    updateGoal: vi.fn(),
    deleteGoal: vi.fn(),
  },
}))

function makeGoal(overrides: Partial<SavingGoal> = {}): SavingGoal {
  return {
    _id: 'g1',
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

function renderCard(goal: SavingGoal) {
  return render(<GoalCard goal={goal} currency="EUR" onEdit={vi.fn()} />)
}

describe('GoalCard for a contribution goal', () => {
  it('shows the total saved and the cadence', () => {
    renderCard(makeGoal())

    expect(screen.getByText('€250.00 saved')).toBeInTheDocument()
    expect(screen.getByText('€100.00 / month')).toBeInTheDocument()
  })

  it('renders no progress bar and no percentage', () => {
    const { container } = renderCard(makeGoal())

    expect(container.querySelector('.bg-muted.rounded-full')).toBeNull()
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument()
  })

  // A contribution goal never completes, so it must never claim to be funded.
  it('never shows the Fully funded badge, even with a large balance', () => {
    renderCard(makeGoal({ allocatedAmount: 999999 }))

    expect(screen.queryByText('Fully funded')).not.toBeInTheDocument()
  })

  it('labels the weekly and yearly cadences', () => {
    renderCard(makeGoal({ contributionPeriodType: 'weekly', contributionMonthDay: undefined, contributionWeekDay: 1 }))
    expect(screen.getByText('€100.00 / week')).toBeInTheDocument()

    renderCard(makeGoal({ contributionPeriodType: 'yearly', contributionMonthDay: undefined, contributionYearDay: 1 }))
    expect(screen.getByText('€100.00 / year')).toBeInTheDocument()
  })
})

describe('GoalCard for a target goal', () => {
  function targetGoal(overrides: Partial<SavingGoal> = {}) {
    return makeGoal({
      goalType: 'target',
      targetAmount: 1000,
      contributionAmount: undefined,
      contributionPeriodType: undefined,
      contributionMonthDay: undefined,
      ...overrides,
    })
  }

  it('still shows the progress bar and percentage', () => {
    const { container } = renderCard(targetGoal())

    expect(container.querySelector('.bg-muted.rounded-full')).not.toBeNull()
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(screen.getByText('€1,000.00')).toBeInTheDocument()
  })

  it('still shows the Fully funded badge once the target is reached', () => {
    renderCard(targetGoal({ allocatedAmount: 1000 }))

    expect(screen.getByText('Fully funded')).toBeInTheDocument()
  })
})
