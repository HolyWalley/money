import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { Children, isValidElement } from 'react'
import { GoalForm } from './GoalForm'
import type { GoalFormValues } from './GoalForm'
import { createSavingGoalSchema } from '../../../shared/schemas/saving-goal.schema'
import type { Wallet } from '../../../shared/schemas/wallet.schema'

// The real select is a Base UI popup; a native one keeps the label wiring and
// lets the test drive the goal-type and cadence handlers directly.
vi.mock('@/components/ui/select', () => {
  function triggerId(children: ReactNode): string | undefined {
    for (const child of Children.toArray(children)) {
      if (isValidElement<{ id?: string }>(child) && child.props.id) return child.props.id
    }
    return undefined
  }

  return {
    Select: ({ items, value, onValueChange, children, disabled }: {
      items?: { value: string; label: string }[]
      value?: string
      onValueChange?: (value: string) => void
      children?: ReactNode
      disabled?: boolean
    }) => (
      <select
        id={triggerId(children)}
        value={value ?? ''}
        disabled={disabled}
        onChange={event => onValueChange?.(event.target.value)}
      >
        {(items ?? []).map(item => (
          <option key={item.value} value={item.value}>{item.label}</option>
        ))}
      </select>
    ),
    SelectTrigger: () => null,
    SelectContent: () => null,
    SelectItem: () => null,
    SelectValue: () => null,
  }
})

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

function Harness({ defaults }: { defaults: Partial<GoalFormValues> }) {
  const form = useForm<GoalFormValues>({
    defaultValues: { walletId: 'w-sav', name: 'Travel', goalType: 'target', targetAmount: 0, ...defaults },
  })

  return (
    <>
      <GoalForm form={form} isSubmitting={false} savingsWallets={wallets} isEditMode={false} isLinkedToRecurring={false} />
      <pre data-testid="values">{JSON.stringify(form.watch())}</pre>
    </>
  )
}

function values(): Record<string, unknown> {
  return JSON.parse(screen.getByTestId('values').textContent ?? '{}')
}

describe('GoalForm goal type switching', () => {
  it('drops the target fields and defaults the cadence when switching to a contribution goal', async () => {
    const user = userEvent.setup()
    render(<Harness defaults={{ targetAmount: 500, targetDate: '2026-06-01T00:00:00.000Z' }} />)

    await user.selectOptions(screen.getByLabelText('Goal Type'), 'contribution')

    expect(values()).toMatchObject({
      goalType: 'contribution',
      contributionPeriodType: 'monthly',
      contributionMonthDay: 1,
    })
    expect(values().targetAmount).toBeUndefined()
    expect(values().targetDate).toBeUndefined()
  })

  it('drops every contribution field when switching back to a target goal', async () => {
    const user = userEvent.setup()
    render(<Harness defaults={{}} />)

    await user.selectOptions(screen.getByLabelText('Goal Type'), 'contribution')
    await user.selectOptions(screen.getByLabelText('Goal Type'), 'target')

    const current = values()
    expect(current.goalType).toBe('target')
    expect(current.contributionAmount).toBeUndefined()
    expect(current.contributionPeriodType).toBeUndefined()
    expect(current.contributionMonthDay).toBeUndefined()
    expect(current.contributionWeekDay).toBeUndefined()
    expect(current.contributionYearDay).toBeUndefined()
  })

  // The schema rejects an anchor that does not match the cadence, so the swap
  // must leave exactly one anchor behind.
  it('swaps the anchor day when the cadence changes', async () => {
    const user = userEvent.setup()
    render(<Harness defaults={{}} />)

    await user.selectOptions(screen.getByLabelText('Goal Type'), 'contribution')
    await user.selectOptions(screen.getByLabelText('Repeats'), 'weekly')

    expect(values()).toMatchObject({ contributionPeriodType: 'weekly', contributionWeekDay: 1 })
    expect(values().contributionMonthDay).toBeUndefined()

    await user.selectOptions(screen.getByLabelText('Repeats'), 'yearly')

    expect(values()).toMatchObject({ contributionPeriodType: 'yearly', contributionYearDay: 1 })
    expect(values().contributionMonthDay).toBeUndefined()
    expect(values().contributionWeekDay).toBeUndefined()
  })

  it('produces a shape the create schema accepts after switching cadence twice', async () => {
    const user = userEvent.setup()
    render(<Harness defaults={{}} />)

    await user.selectOptions(screen.getByLabelText('Goal Type'), 'contribution')
    await user.type(screen.getByLabelText('Contribution Amount'), '100')
    await user.selectOptions(screen.getByLabelText('Repeats'), 'weekly')
    await user.selectOptions(screen.getByLabelText('Repeats'), 'monthly')

    expect(createSavingGoalSchema.safeParse(values()).success).toBe(true)
  })

  it('shows only the fields belonging to the selected goal type', async () => {
    const user = userEvent.setup()
    render(<Harness defaults={{}} />)

    expect(screen.getByLabelText('Target Amount')).toBeInTheDocument()
    expect(screen.queryByLabelText('Contribution Amount')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Goal Type'), 'contribution')

    expect(screen.getByLabelText('Contribution Amount')).toBeInTheDocument()
    expect(screen.getByLabelText('Month Start Day')).toBeInTheDocument()
    expect(screen.queryByLabelText('Target Amount')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Deadline (optional)')).not.toBeInTheDocument()
  })
})
