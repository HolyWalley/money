import { UTCDate } from '@date-fns/utc'
import { describe, it, expect } from 'vitest'
import {
  dividendYears,
  dividendsIn,
  summariseDividends,
  totalDividends,
  trailingTwelveMonths,
  yearlyTotals,
} from './dividend-history'
import type { DailyConverter } from './portfolio-history'
import type { PositionTrade } from './positions'

function trade(overrides: Partial<PositionTrade> & { date: string }): PositionTrade {
  return {
    instrumentId: 'abev',
    kind: 'dividend',
    quantity: 0,
    amount: 10,
    currency: 'EUR',
    ...overrides,
  }
}

const asEuros: DailyConverter = (amount, currency) => (currency === 'EUR' ? amount : null)

describe('summariseDividends', () => {
  it('adds up what was paid in each month', () => {
    const { months } = summariseDividends(
      [
        trade({ date: '2025-01-15T00:00:00.000Z', amount: 20 }),
        trade({ date: '2025-01-28T00:00:00.000Z', amount: 26.4 }),
        trade({ date: '2025-07-02T00:00:00.000Z', amount: 9.5 }),
      ],
      asEuros
    )

    expect(months).toEqual([
      { year: 2025, month: 0, amount: 46.4 },
      { year: 2025, month: 6, amount: 9.5 },
    ])
  })

  it('counts nothing but dividends', () => {
    const { months } = summariseDividends(
      [
        trade({ date: '2025-01-15T00:00:00.000Z', kind: 'buy', amount: -1000 }),
        trade({ date: '2025-01-16T00:00:00.000Z', kind: 'sell', amount: 1100 }),
        trade({ date: '2025-01-17T00:00:00.000Z', kind: 'fee', amount: -2 }),
        trade({ date: '2025-01-18T00:00:00.000Z', amount: 7 }),
      ],
      asEuros
    )

    expect(months).toEqual([{ year: 2025, month: 0, amount: 7 }])
  })

  // A payment received in 2024 is 2024 income whatever the currency has done
  // since, so it is converted at the rate of the day it arrived.
  it('converts each payment at the rate of the day it was received', () => {
    const rates: Record<string, number> = { '2024-06-03': 2, '2025-06-03': 5 }
    const atTheDaysRate: DailyConverter = (amount, currency, onDate) =>
      currency === 'USD' ? amount * rates[onDate.toISOString().split('T')[0]] : null

    const { months } = summariseDividends(
      [
        trade({ date: '2024-06-03T00:00:00.000Z', amount: 10, currency: 'USD' }),
        trade({ date: '2025-06-03T00:00:00.000Z', amount: 10, currency: 'USD' }),
      ],
      atTheDaysRate
    )

    expect(months.map(month => month.amount)).toEqual([20, 50])
  })

  it('names a currency no rate reaches rather than counting it as nothing', () => {
    const { months, missingCurrencies } = summariseDividends(
      [
        trade({ date: '2025-01-15T00:00:00.000Z', amount: 20 }),
        trade({ date: '2025-01-16T00:00:00.000Z', amount: 30, currency: 'BRL' }),
      ],
      asEuros
    )

    expect(missingCurrencies).toEqual(['BRL'])
    expect(months).toEqual([{ year: 2025, month: 0, amount: 20 }])
  })

  it('leaves out a payment nobody can place in time', () => {
    const { months } = summariseDividends([trade({ date: 'not a date' })], asEuros)

    expect(months).toEqual([])
  })
})

describe('reading the payments back', () => {
  const months = [
    { year: 2023, month: 11, amount: 0.1 },
    { year: 2025, month: 0, amount: 46.4 },
    { year: 2025, month: 6, amount: 9.5 },
    { year: 2026, month: 0, amount: 33.5 },
  ]

  it('lists the years newest first, as the tabs read', () => {
    expect(dividendYears(months)).toEqual([2026, 2025, 2023])
  })

  it('adds up what a selection came to', () => {
    expect(totalDividends(months)).toBeCloseTo(89.5, 10)
    expect(totalDividends(dividendsIn(months, 2025))).toBeCloseTo(55.9, 10)
  })

  // In March, a calendar year holds three months of income and reads as a
  // collapse next to last year's twelve.
  it('rolls the last twelve months rather than cutting at January', () => {
    const trailing = trailingTwelveMonths(months, new UTCDate('2026-03-15T00:00:00.000Z'))

    expect(trailing).toEqual([
      { year: 2025, month: 6, amount: 9.5 },
      { year: 2026, month: 0, amount: 33.5 },
    ])
  })

  // 2024 paid nothing, and a chart that skipped it would put 2023 next to 2025
  // and read as two consecutive years.
  it('keeps a year nothing was paid in', () => {
    expect(yearlyTotals(months)).toEqual([
      { year: 2023, amount: 0.1 },
      { year: 2024, amount: 0 },
      { year: 2025, amount: 55.9 },
      { year: 2026, amount: 33.5 },
    ])
  })

  it('has nothing to chart when nothing was ever paid', () => {
    expect(yearlyTotals([])).toEqual([])
    expect(dividendYears([])).toEqual([])
  })
})
