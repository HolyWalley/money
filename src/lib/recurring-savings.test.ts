import { describe, it, expect } from 'vitest'
import { UTCDate } from '@date-fns/utc'
import {
  buildLinkedGoalFunding,
  savedForOccurrence,
  outstandingAmount,
} from './recurring-savings'
import type { SavingGoal } from '../../shared/schemas/saving-goal.schema'

function makeGoal(overrides: Partial<SavingGoal> = {}): SavingGoal {
  return {
    _id: 'g1',
    walletId: 'w-sav',
    name: 'Rent',
    goalType: 'target',
    targetAmount: 1200,
    targetDate: '2026-10-05T00:00:00.000Z',
    allocatedAmount: 800,
    achieved: false,
    order: 0,
    sourceRecurringPaymentId: 'rp-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildLinkedGoalFunding', () => {
  it('indexes a linked goal by the payment it saves for', () => {
    const funding = buildLinkedGoalFunding([makeGoal()])

    expect(funding.get('rp-1')).toEqual({
      goalId: 'g1',
      targetDate: new Date('2026-10-05T00:00:00.000Z'),
      allocatedAmount: 800,
    })
  })

  it('ignores goals that are not linked to a payment', () => {
    const funding = buildLinkedGoalFunding([
      makeGoal({ sourceRecurringPaymentId: undefined }),
      makeGoal({ _id: 'g2', sourceRecurringPaymentId: '' }),
    ])

    expect(funding.size).toBe(0)
  })

  // An achieved goal is the record of a payment already made; its money is
  // spent, not waiting.
  it('ignores achieved goals', () => {
    const funding = buildLinkedGoalFunding([makeGoal({ achieved: true })])

    expect(funding.size).toBe(0)
  })

  it('ignores contribution goals', () => {
    const funding = buildLinkedGoalFunding([
      makeGoal({
        goalType: 'contribution',
        targetAmount: undefined,
        contributionAmount: 100,
        contributionPeriodType: 'monthly',
        contributionMonthDay: 1,
      }),
    ])

    expect(funding.size).toBe(0)
  })

  it('ignores goals with no deadline, since nothing says which occurrence they cover', () => {
    const funding = buildLinkedGoalFunding([makeGoal({ targetDate: undefined })])

    expect(funding.size).toBe(0)
  })

  // findActiveLinkedGoal takes the first match, and the goal it picks is the one
  // that later gets marked achieved. Picking a different one here would credit
  // money against a payment the linker is not tracking.
  it('keeps the first goal when two point at the same payment', () => {
    const funding = buildLinkedGoalFunding([
      makeGoal({ _id: 'first', allocatedAmount: 800 }),
      makeGoal({ _id: 'second', allocatedAmount: 50 }),
    ])

    expect(funding.get('rp-1')?.goalId).toBe('first')
  })

  // Records written before goalType existed carry no type at all, and they are
  // all target goals.
  it('treats a goal with no goalType as a target goal', () => {
    const goal = makeGoal()
    delete (goal as { goalType?: unknown }).goalType

    const funding = buildLinkedGoalFunding([goal])

    expect(funding.get('rp-1')?.allocatedAmount).toBe(800)
  })

  // The Dexie mirror stores targetDate as a Date even though the type says
  // string, so both shapes reach this code.
  it('accepts a targetDate that arrives as a Date', () => {
    const goal = makeGoal()
    ;(goal as { targetDate: unknown }).targetDate = new Date('2026-10-05T00:00:00.000Z')

    const funding = buildLinkedGoalFunding([goal])

    expect(funding.get('rp-1')?.targetDate).toEqual(new Date('2026-10-05T00:00:00.000Z'))
  })
})

describe('savedForOccurrence', () => {
  const funding = {
    goalId: 'g1',
    targetDate: new UTCDate('2026-10-05T00:00:00.000Z'),
    allocatedAmount: 800,
  }

  it('credits the occurrence the goal is saving for', () => {
    expect(savedForOccurrence(funding, new UTCDate('2026-10-05T09:30:00.000Z'))).toBe(800)
  })

  it('credits nothing to any other occurrence of the same payment', () => {
    expect(savedForOccurrence(funding, new UTCDate('2026-11-05T00:00:00.000Z'))).toBe(0)
  })

  it('credits nothing when the payment has no linked goal', () => {
    expect(savedForOccurrence(undefined, new UTCDate('2026-10-05T00:00:00.000Z'))).toBe(0)
  })

  it('never returns a negative amount', () => {
    expect(savedForOccurrence({ ...funding, allocatedAmount: -20 }, new UTCDate('2026-10-05T00:00:00.000Z'))).toBe(0)
  })
})

describe('outstandingAmount', () => {
  it('subtracts what is already saved', () => {
    expect(outstandingAmount(1200, 800)).toBe(400)
  })

  it('leaves the amount alone when nothing is saved', () => {
    expect(outstandingAmount(1200, 0)).toBe(1200)
  })

  it('floors at zero when the goal holds more than the payment', () => {
    expect(outstandingAmount(1200, 1500)).toBe(0)
  })
})
