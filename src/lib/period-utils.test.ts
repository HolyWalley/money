import { describe, it, expect } from 'vitest'
import { UTCDate } from '@date-fns/utc'
import {
  getPeriodContainingDate,
  getAdjacentPeriod,
  isDateInPeriod,
  canNavigate,
  type PeriodSettings,
} from './period-utils'

function date(str: string): UTCDate {
  const [year, month, day] = str.split('-').map(Number)
  return new UTCDate(year, month - 1, day, 12, 0, 0)
}

function formatDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function expectPeriod(period: { start: Date; end: Date }, startStr: string, endStr: string) {
  expect(formatDate(period.start)).toBe(startStr)
  expect(formatDate(period.end)).toBe(endStr)
}

describe('period-utils', () => {
  describe('getPeriodContainingDate - monthly', () => {
    describe('with monthDay = 1 (default)', () => {
      const settings: PeriodSettings = { type: 'monthly', monthDay: 1 }

      it('returns correct period for date in middle of month', () => {
        const period = getPeriodContainingDate(date('2026-01-15'), settings)
        expectPeriod(period, '2026-01-01', '2026-01-31')
      })

      it('returns correct period for first day of month', () => {
        const period = getPeriodContainingDate(date('2026-01-01'), settings)
        expectPeriod(period, '2026-01-01', '2026-01-31')
      })

      it('returns correct period for last day of month', () => {
        const period = getPeriodContainingDate(date('2026-01-31'), settings)
        expectPeriod(period, '2026-01-01', '2026-01-31')
      })

      it('handles February correctly', () => {
        const period = getPeriodContainingDate(date('2026-02-15'), settings)
        expectPeriod(period, '2026-02-01', '2026-02-28')
      })

      it('handles February in leap year', () => {
        const period = getPeriodContainingDate(date('2024-02-15'), settings)
        expectPeriod(period, '2024-02-01', '2024-02-29')
      })
    })

    describe('with monthDay = 15', () => {
      const settings: PeriodSettings = { type: 'monthly', monthDay: 15 }

      it('returns previous month period when date is before monthDay', () => {
        const period = getPeriodContainingDate(date('2026-01-05'), settings)
        expectPeriod(period, '2025-12-15', '2026-01-14')
      })

      it('returns current month period when date is on monthDay', () => {
        const period = getPeriodContainingDate(date('2026-01-15'), settings)
        expectPeriod(period, '2026-01-15', '2026-02-14')
      })

      it('returns current month period when date is after monthDay', () => {
        const period = getPeriodContainingDate(date('2026-01-20'), settings)
        expectPeriod(period, '2026-01-15', '2026-02-14')
      })

      it('returns correct period for last day before next period', () => {
        const period = getPeriodContainingDate(date('2026-01-14'), settings)
        expectPeriod(period, '2025-12-15', '2026-01-14')
      })
    })

    describe('with monthDay = 31 (month overflow)', () => {
      const settings: PeriodSettings = { type: 'monthly', monthDay: 31 }

      it('Jan 31 is start of Jan 31 - Feb 27 period', () => {
        const period = getPeriodContainingDate(date('2026-01-31'), settings)
        expectPeriod(period, '2026-01-31', '2026-02-27')
      })

      it('Feb 27 is last day of Jan 31 - Feb 27 period', () => {
        const period = getPeriodContainingDate(date('2026-02-27'), settings)
        expectPeriod(period, '2026-01-31', '2026-02-27')
      })

      it('Feb 28 starts new period (clamped from 31) in non-leap year', () => {
        const period = getPeriodContainingDate(date('2026-02-28'), settings)
        expectPeriod(period, '2026-02-28', '2026-03-30')
      })

      it('Feb 28 is last day of Jan 31 - Feb 28 period in leap year', () => {
        const period = getPeriodContainingDate(date('2024-02-28'), settings)
        expectPeriod(period, '2024-01-31', '2024-02-28')
      })

      it('Feb 29 starts new period in leap year', () => {
        const period = getPeriodContainingDate(date('2024-02-29'), settings)
        expectPeriod(period, '2024-02-29', '2024-03-30')
      })

      it('Apr 29 is last day of Mar 31 - Apr 29 period', () => {
        const period = getPeriodContainingDate(date('2026-04-29'), settings)
        expectPeriod(period, '2026-03-31', '2026-04-29')
      })

      it('Apr 30 starts new period (clamped from 31)', () => {
        const period = getPeriodContainingDate(date('2026-04-30'), settings)
        expectPeriod(period, '2026-04-30', '2026-05-30')
      })

      it('Mar 30 is last day of Feb 28 - Mar 30 period', () => {
        const period = getPeriodContainingDate(date('2026-03-30'), settings)
        expectPeriod(period, '2026-02-28', '2026-03-30')
      })

      it('Mar 31 starts new period', () => {
        const period = getPeriodContainingDate(date('2026-03-31'), settings)
        expectPeriod(period, '2026-03-31', '2026-04-29')
      })
    })

    describe('with monthDay = 17 (original bug scenario)', () => {
      const settings: PeriodSettings = { type: 'monthly', monthDay: 17 }

      it('Jan 5 should be in Dec 17 - Jan 16 period', () => {
        const period = getPeriodContainingDate(date('2026-01-05'), settings)
        expectPeriod(period, '2025-12-17', '2026-01-16')
      })

      it('Jan 16 should be in Dec 17 - Jan 16 period', () => {
        const period = getPeriodContainingDate(date('2026-01-16'), settings)
        expectPeriod(period, '2025-12-17', '2026-01-16')
      })

      it('Jan 17 should be in Jan 17 - Feb 16 period', () => {
        const period = getPeriodContainingDate(date('2026-01-17'), settings)
        expectPeriod(period, '2026-01-17', '2026-02-16')
      })

      it('Jan 19 should be in Jan 17 - Feb 16 period', () => {
        const period = getPeriodContainingDate(date('2026-01-19'), settings)
        expectPeriod(period, '2026-01-17', '2026-02-16')
      })
    })

    describe('year boundary', () => {
      const settings: PeriodSettings = { type: 'monthly', monthDay: 15 }

      it('handles December to January transition', () => {
        const period = getPeriodContainingDate(date('2026-01-01'), settings)
        expectPeriod(period, '2025-12-15', '2026-01-14')
      })

      it('handles year end correctly', () => {
        const period = getPeriodContainingDate(date('2025-12-31'), settings)
        expectPeriod(period, '2025-12-15', '2026-01-14')
      })
    })
  })

  describe('getPeriodContainingDate - weekly', () => {
    describe('with weekDay = 1 (Monday)', () => {
      const settings: PeriodSettings = { type: 'weekly', weekDay: 1 }

      it('returns Mon-Sun for a Wednesday', () => {
        const period = getPeriodContainingDate(date('2026-01-14'), settings)
        expectPeriod(period, '2026-01-12', '2026-01-18')
      })

      it('returns Mon-Sun for a Monday', () => {
        const period = getPeriodContainingDate(date('2026-01-12'), settings)
        expectPeriod(period, '2026-01-12', '2026-01-18')
      })

      it('returns Mon-Sun for a Sunday', () => {
        const period = getPeriodContainingDate(date('2026-01-18'), settings)
        expectPeriod(period, '2026-01-12', '2026-01-18')
      })
    })

    describe('with weekDay = 0 (Sunday)', () => {
      const settings: PeriodSettings = { type: 'weekly', weekDay: 0 }

      it('returns Sun-Sat for a Wednesday', () => {
        const period = getPeriodContainingDate(date('2026-01-14'), settings)
        expectPeriod(period, '2026-01-11', '2026-01-17')
      })

      it('returns Sun-Sat for a Sunday', () => {
        const period = getPeriodContainingDate(date('2026-01-11'), settings)
        expectPeriod(period, '2026-01-11', '2026-01-17')
      })

      it('returns Sun-Sat for a Saturday', () => {
        const period = getPeriodContainingDate(date('2026-01-17'), settings)
        expectPeriod(period, '2026-01-11', '2026-01-17')
      })
    })

    describe('with weekDay = 3 (Wednesday)', () => {
      const settings: PeriodSettings = { type: 'weekly', weekDay: 3 }

      it('returns Wed-Tue for a Friday', () => {
        const period = getPeriodContainingDate(date('2026-01-16'), settings)
        expectPeriod(period, '2026-01-14', '2026-01-20')
      })

      it('returns Wed-Tue for a Wednesday', () => {
        const period = getPeriodContainingDate(date('2026-01-14'), settings)
        expectPeriod(period, '2026-01-14', '2026-01-20')
      })

      it('returns Wed-Tue for a Tuesday', () => {
        const period = getPeriodContainingDate(date('2026-01-13'), settings)
        expectPeriod(period, '2026-01-07', '2026-01-13')
      })
    })

    describe('week spanning year boundary', () => {
      const settings: PeriodSettings = { type: 'weekly', weekDay: 1 }

      it('handles week spanning Dec-Jan', () => {
        const period = getPeriodContainingDate(date('2026-01-01'), settings)
        expectPeriod(period, '2025-12-29', '2026-01-04')
      })
    })
  })

  describe('getPeriodContainingDate - yearly', () => {
    describe('with yearDay = 1 (default)', () => {
      const settings: PeriodSettings = { type: 'yearly', yearDay: 1 }

      it('returns full year for date in middle of year', () => {
        const period = getPeriodContainingDate(date('2026-06-15'), settings)
        expectPeriod(period, '2026-01-01', '2026-12-31')
      })

      it('returns full year for first day', () => {
        const period = getPeriodContainingDate(date('2026-01-01'), settings)
        expectPeriod(period, '2026-01-01', '2026-12-31')
      })

      it('returns full year for last day', () => {
        const period = getPeriodContainingDate(date('2026-12-31'), settings)
        expectPeriod(period, '2026-01-01', '2026-12-31')
      })
    })

    describe('with yearDay = 100 (April 10)', () => {
      const settings: PeriodSettings = { type: 'yearly', yearDay: 100 }

      it('returns previous year period for date before yearDay', () => {
        const period = getPeriodContainingDate(date('2026-03-15'), settings)
        expectPeriod(period, '2025-04-10', '2026-04-09')
      })

      it('returns current year period for date on yearDay', () => {
        const period = getPeriodContainingDate(date('2026-04-10'), settings)
        expectPeriod(period, '2026-04-10', '2027-04-09')
      })

      it('returns current year period for date after yearDay', () => {
        const period = getPeriodContainingDate(date('2026-06-01'), settings)
        expectPeriod(period, '2026-04-10', '2027-04-09')
      })
    })

    describe('with yearDay = 366 (leap year handling)', () => {
      const settings: PeriodSettings = { type: 'yearly', yearDay: 366 }

      it('Dec 30 2026 is last day of period starting Dec 31 2025 (non-leap year clamps to 365)', () => {
        const period = getPeriodContainingDate(date('2026-12-30'), settings)
        expectPeriod(period, '2025-12-31', '2026-12-30')
      })

      it('Dec 31 2026 starts new period (non-leap year)', () => {
        const period = getPeriodContainingDate(date('2026-12-31'), settings)
        expectPeriod(period, '2026-12-31', '2027-12-30')
      })

      it('Dec 31 2024 is day 366 in leap year, starts new period', () => {
        const period = getPeriodContainingDate(date('2024-12-31'), settings)
        expectPeriod(period, '2024-12-31', '2025-12-30')
      })

      it('Dec 30 2024 is last day of previous period', () => {
        const period = getPeriodContainingDate(date('2024-12-30'), settings)
        expectPeriod(period, '2023-12-31', '2024-12-30')
      })
    })
  })

  describe('getPeriodContainingDate - last N days', () => {
    it('last7days returns correct range', () => {
      const settings: PeriodSettings = { type: 'last7days' }
      const period = getPeriodContainingDate(date('2026-01-15'), settings)
      expectPeriod(period, '2026-01-09', '2026-01-15')
    })

    it('last30days returns correct range', () => {
      const settings: PeriodSettings = { type: 'last30days' }
      const period = getPeriodContainingDate(date('2026-01-15'), settings)
      expectPeriod(period, '2025-12-17', '2026-01-15')
    })

    it('last365days returns correct range', () => {
      const settings: PeriodSettings = { type: 'last365days' }
      const period = getPeriodContainingDate(date('2026-01-15'), settings)
      expectPeriod(period, '2025-01-16', '2026-01-15')
    })

    it('last7days handles year boundary', () => {
      const settings: PeriodSettings = { type: 'last7days' }
      const period = getPeriodContainingDate(date('2026-01-03'), settings)
      expectPeriod(period, '2025-12-28', '2026-01-03')
    })
  })

  describe('getPeriodContainingDate - custom', () => {
    it('returns custom date range', () => {
      const settings: PeriodSettings = {
        type: 'custom',
        customFrom: date('2026-01-10'),
        customTo: date('2026-01-20'),
      }
      const period = getPeriodContainingDate(date('2026-01-15'), settings)
      expectPeriod(period, '2026-01-10', '2026-01-20')
    })

    it('uses provided date when custom dates not set', () => {
      const settings: PeriodSettings = { type: 'custom' }
      const period = getPeriodContainingDate(date('2026-01-15'), settings)
      expectPeriod(period, '2026-01-15', '2026-01-15')
    })
  })

  describe('getAdjacentPeriod', () => {
    describe('monthly navigation', () => {
      const settings: PeriodSettings = { type: 'monthly', monthDay: 15 }

      it('returns same period for offset 0', () => {
        const current = getPeriodContainingDate(date('2026-01-20'), settings)
        const adjacent = getAdjacentPeriod(current, 0, settings)
        expectPeriod(adjacent, '2026-01-15', '2026-02-14')
      })

      it('returns previous period for offset -1', () => {
        const current = getPeriodContainingDate(date('2026-01-20'), settings)
        const adjacent = getAdjacentPeriod(current, -1, settings)
        expectPeriod(adjacent, '2025-12-15', '2026-01-14')
      })

      it('returns next period for offset 1', () => {
        const current = getPeriodContainingDate(date('2026-01-20'), settings)
        const adjacent = getAdjacentPeriod(current, 1, settings)
        expectPeriod(adjacent, '2026-02-15', '2026-03-14')
      })

      it('handles multiple offsets', () => {
        const current = getPeriodContainingDate(date('2026-01-20'), settings)
        const adjacent = getAdjacentPeriod(current, -3, settings)
        expectPeriod(adjacent, '2025-10-15', '2025-11-14')
      })
    })

    describe('weekly navigation', () => {
      const settings: PeriodSettings = { type: 'weekly', weekDay: 1 }

      it('returns previous week for offset -1', () => {
        const current = getPeriodContainingDate(date('2026-01-14'), settings)
        const adjacent = getAdjacentPeriod(current, -1, settings)
        expectPeriod(adjacent, '2026-01-05', '2026-01-11')
      })

      it('returns next week for offset 1', () => {
        const current = getPeriodContainingDate(date('2026-01-14'), settings)
        const adjacent = getAdjacentPeriod(current, 1, settings)
        expectPeriod(adjacent, '2026-01-19', '2026-01-25')
      })
    })

    describe('yearly navigation', () => {
      const settings: PeriodSettings = { type: 'yearly', yearDay: 100 }

      it('returns previous year for offset -1', () => {
        const current = getPeriodContainingDate(date('2026-06-01'), settings)
        const adjacent = getAdjacentPeriod(current, -1, settings)
        expectPeriod(adjacent, '2025-04-10', '2026-04-09')
      })

      it('returns next year for offset 1', () => {
        const current = getPeriodContainingDate(date('2026-06-01'), settings)
        const adjacent = getAdjacentPeriod(current, 1, settings)
        expectPeriod(adjacent, '2027-04-10', '2028-04-08')
      })
    })

    describe('non-navigable periods', () => {
      it('returns same period for last7days', () => {
        const settings: PeriodSettings = { type: 'last7days' }
        const current = getPeriodContainingDate(date('2026-01-15'), settings)
        const adjacent = getAdjacentPeriod(current, -1, settings)
        expectPeriod(adjacent, '2026-01-09', '2026-01-15')
      })

      it('returns same period for custom', () => {
        const settings: PeriodSettings = {
          type: 'custom',
          customFrom: date('2026-01-10'),
          customTo: date('2026-01-20'),
        }
        const current = getPeriodContainingDate(date('2026-01-15'), settings)
        const adjacent = getAdjacentPeriod(current, 1, settings)
        expectPeriod(adjacent, '2026-01-10', '2026-01-20')
      })
    })
  })

  describe('isDateInPeriod', () => {
    const period = {
      start: new UTCDate(2026, 0, 15, 0, 0, 0),
      end: new UTCDate(2026, 1, 14, 23, 59, 59),
    }

    it('returns true for date at start of period', () => {
      expect(isDateInPeriod(date('2026-01-15'), period)).toBe(true)
    })

    it('returns true for date at end of period', () => {
      expect(isDateInPeriod(date('2026-02-14'), period)).toBe(true)
    })

    it('returns true for date in middle of period', () => {
      expect(isDateInPeriod(date('2026-01-25'), period)).toBe(true)
    })

    it('returns false for date before period', () => {
      expect(isDateInPeriod(date('2026-01-14'), period)).toBe(false)
    })

    it('returns false for date after period', () => {
      expect(isDateInPeriod(date('2026-02-15'), period)).toBe(false)
    })
  })

  describe('canNavigate', () => {
    it('returns true for monthly', () => {
      expect(canNavigate({ type: 'monthly' })).toBe(true)
    })

    it('returns true for weekly', () => {
      expect(canNavigate({ type: 'weekly' })).toBe(true)
    })

    it('returns true for yearly', () => {
      expect(canNavigate({ type: 'yearly' })).toBe(true)
    })

    it('returns false for last7days', () => {
      expect(canNavigate({ type: 'last7days' })).toBe(false)
    })

    it('returns false for last30days', () => {
      expect(canNavigate({ type: 'last30days' })).toBe(false)
    })

    it('returns false for last365days', () => {
      expect(canNavigate({ type: 'last365days' })).toBe(false)
    })

    it('returns false for custom', () => {
      expect(canNavigate({ type: 'custom' })).toBe(false)
    })
  })

  describe('continuous periods (no gaps)', () => {
    it('monthly periods are continuous', () => {
      const settings: PeriodSettings = { type: 'monthly', monthDay: 17 }
      const period1 = getPeriodContainingDate(date('2026-01-16'), settings)
      const period2 = getPeriodContainingDate(date('2026-01-17'), settings)

      const period1EndDate = period1.end.toISOString().slice(0, 10)
      const period2StartDate = period2.start.toISOString().slice(0, 10)

      expect(period1EndDate).toBe('2026-01-16')
      expect(period2StartDate).toBe('2026-01-17')
    })

    it('weekly periods are continuous', () => {
      const settings: PeriodSettings = { type: 'weekly', weekDay: 3 }
      const period1 = getPeriodContainingDate(date('2026-01-13'), settings)
      const period2 = getPeriodContainingDate(date('2026-01-14'), settings)

      const period1EndDate = period1.end.toISOString().slice(0, 10)
      const period2StartDate = period2.start.toISOString().slice(0, 10)

      expect(period1EndDate).toBe('2026-01-13')
      expect(period2StartDate).toBe('2026-01-14')
    })

    it('every day belongs to exactly one monthly period', () => {
      const settings: PeriodSettings = { type: 'monthly', monthDay: 17 }

      for (let day = 1; day <= 31; day++) {
        const dateStr = `2026-01-${day.toString().padStart(2, '0')}`
        const period = getPeriodContainingDate(date(dateStr), settings)
        expect(isDateInPeriod(date(dateStr), period)).toBe(true)
      }
    })

    it('every day belongs to exactly one weekly period', () => {
      const settings: PeriodSettings = { type: 'weekly', weekDay: 3 }

      for (let day = 1; day <= 31; day++) {
        const dateStr = `2026-01-${day.toString().padStart(2, '0')}`
        const period = getPeriodContainingDate(date(dateStr), settings)
        expect(isDateInPeriod(date(dateStr), period)).toBe(true)
      }
    })
  })
})
