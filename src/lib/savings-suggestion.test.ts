import { describe, it, expect } from 'vitest'
import { UTCDate } from '@date-fns/utc'
import { getSavingsSuggestion } from './savings-suggestion'

function at(year: number, monthIndex: number, day: number): Date {
  return new Date(new UTCDate(year, monthIndex, day).toISOString())
}

function isoAt(year: number, monthIndex: number, day: number): string {
  return new UTCDate(year, monthIndex, day).toISOString()
}

describe('getSavingsSuggestion', () => {
  it('returns no-deadline when targetDate is missing', () => {
    const now = at(2026, 4, 9)
    const result = getSavingsSuggestion({ targetAmount: 1000, allocatedAmount: 0 }, now)
    expect(result).toEqual({
      status: 'no-deadline',
      remainingAmount: 1000,
      monthsRemaining: 0,
      monthlyAmount: 0,
    })
  })

  it('returns fully-funded when allocatedAmount equals targetAmount', () => {
    const now = at(2026, 4, 9)
    const result = getSavingsSuggestion(
      { targetAmount: 1000, allocatedAmount: 1000, targetDate: isoAt(2026, 8, 9) },
      now
    )
    expect(result).toEqual({
      status: 'fully-funded',
      remainingAmount: 0,
      monthsRemaining: 0,
      monthlyAmount: 0,
    })
  })

  it('returns fully-funded when allocatedAmount exceeds targetAmount', () => {
    const now = at(2026, 4, 9)
    const result = getSavingsSuggestion(
      { targetAmount: 1000, allocatedAmount: 1500, targetDate: isoAt(2026, 8, 9) },
      now
    )
    expect(result).toEqual({
      status: 'fully-funded',
      remainingAmount: 0,
      monthsRemaining: 0,
      monthlyAmount: 0,
    })
  })

  it('returns overdue when the deadline is yesterday and goal is under-funded', () => {
    const now = at(2026, 4, 9)
    const result = getSavingsSuggestion(
      { targetAmount: 1000, allocatedAmount: 200, targetDate: isoAt(2026, 4, 8) },
      now
    )
    expect(result).toEqual({
      status: 'overdue',
      remainingAmount: 800,
      monthsRemaining: 0,
      monthlyAmount: 0,
    })
  })

  it('returns under-month when deadline is 5 days from now', () => {
    const now = at(2026, 4, 9)
    const result = getSavingsSuggestion(
      { targetAmount: 1000, allocatedAmount: 0, targetDate: isoAt(2026, 4, 14) },
      now
    )
    expect(result).toEqual({
      status: 'under-month',
      remainingAmount: 1000,
      monthsRemaining: 0,
      monthlyAmount: 0,
    })
  })

  it('returns on-track with monthlyAmount 300 for $1200 over 4 calendar months', () => {
    const now = at(2026, 4, 9)
    const result = getSavingsSuggestion(
      { targetAmount: 1200, allocatedAmount: 0, targetDate: isoAt(2026, 8, 9) },
      now
    )
    expect(result).toEqual({
      status: 'on-track',
      remainingAmount: 1200,
      monthsRemaining: 4,
      monthlyAmount: 300,
    })
  })

  it('returns under-month when deadline is today', () => {
    const now = at(2026, 4, 9)
    const result = getSavingsSuggestion(
      { targetAmount: 1000, allocatedAmount: 0, targetDate: isoAt(2026, 4, 9) },
      now
    )
    expect(result).toEqual({
      status: 'under-month',
      remainingAmount: 1000,
      monthsRemaining: 0,
      monthlyAmount: 0,
    })
  })

  it('rounds monthlyAmount to 2 decimals: $1000 over 3 months → 333.33', () => {
    const now = at(2026, 4, 9)
    const result = getSavingsSuggestion(
      { targetAmount: 1000, allocatedAmount: 0, targetDate: isoAt(2026, 7, 9) },
      now
    )
    expect(result).toEqual({
      status: 'on-track',
      remainingAmount: 1000,
      monthsRemaining: 3,
      monthlyAmount: 333.33,
    })
  })

  it('computes monthlyAmount 400 for partially-funded goal with 2 months left', () => {
    const now = at(2026, 4, 9)
    const result = getSavingsSuggestion(
      { targetAmount: 1000, allocatedAmount: 200, targetDate: isoAt(2026, 6, 9) },
      now
    )
    expect(result).toEqual({
      status: 'on-track',
      remainingAmount: 800,
      monthsRemaining: 2,
      monthlyAmount: 400,
    })
  })
})
