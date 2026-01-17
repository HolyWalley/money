import { describe, it, expect } from 'vitest'
import { UTCDate } from '@date-fns/utc'
import {
  getOccurrencesInPeriod,
  generateLogId,
  parseRRule,
  buildRRule,
  type RRuleOptions,
} from './recurring-utils'

function date(str: string): Date {
  const [year, month, day] = str.split('-').map(Number)
  return new UTCDate(year, month - 1, day, 12, 0, 0)
}

function formatDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function expectDates(dates: Date[], expected: string[]) {
  expect(dates.map(formatDate)).toEqual(expected)
}

describe('recurring-utils', () => {
  describe('getOccurrencesInPeriod', () => {
    describe('daily recurrence', () => {
      it('returns every day in period', () => {
        const rrule = 'FREQ=DAILY'
        const startDate = date('2026-01-01')
        const periodStart = date('2026-01-01')
        const periodEnd = date('2026-01-05')

        const occurrences = getOccurrencesInPeriod(rrule, startDate, periodStart, periodEnd)
        expectDates(occurrences, ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'])
      })

      it('returns every N days', () => {
        const rrule = 'FREQ=DAILY;INTERVAL=3'
        const startDate = date('2026-01-01')
        const periodStart = date('2026-01-01')
        const periodEnd = date('2026-01-10')

        const occurrences = getOccurrencesInPeriod(rrule, startDate, periodStart, periodEnd)
        expectDates(occurrences, ['2026-01-01', '2026-01-04', '2026-01-07', '2026-01-10'])
      })

      it('respects start date before period', () => {
        const rrule = 'FREQ=DAILY;INTERVAL=2'
        const startDate = date('2025-12-30')
        const periodStart = date('2026-01-01')
        const periodEnd = date('2026-01-05')

        const occurrences = getOccurrencesInPeriod(rrule, startDate, periodStart, periodEnd)
        expectDates(occurrences, ['2026-01-01', '2026-01-03', '2026-01-05'])
      })

      it('returns empty for period before start date', () => {
        const rrule = 'FREQ=DAILY'
        const startDate = date('2026-02-01')
        const periodStart = date('2026-01-01')
        const periodEnd = date('2026-01-31')

        const occurrences = getOccurrencesInPeriod(rrule, startDate, periodStart, periodEnd)
        expect(occurrences).toEqual([])
      })

      it('correctly handles every N days spanning February in non-leap year', () => {
        const rrule = 'FREQ=DAILY;INTERVAL=5'
        const startDate = date('2026-02-25')
        const periodStart = date('2026-02-01')
        const periodEnd = date('2026-03-15')

        const occurrences = getOccurrencesInPeriod(rrule, startDate, periodStart, periodEnd)
        // Feb 25 -> Mar 2 (Feb has 28 days in 2026) -> Mar 7 -> Mar 12
        expectDates(occurrences, ['2026-02-25', '2026-03-02', '2026-03-07', '2026-03-12'])
      })

      it('correctly handles every N days spanning February in leap year', () => {
        const rrule = 'FREQ=DAILY;INTERVAL=5'
        const startDate = date('2024-02-25')
        const periodStart = date('2024-02-01')
        const periodEnd = date('2024-03-15')

        const occurrences = getOccurrencesInPeriod(rrule, startDate, periodStart, periodEnd)
        // Feb 25 -> Mar 1 (Feb has 29 days in 2024) -> Mar 6 -> Mar 11
        expectDates(occurrences, ['2024-02-25', '2024-03-01', '2024-03-06', '2024-03-11'])
      })
    })

    describe('weekly recurrence', () => {
      it('returns every week on same day', () => {
        const rrule = 'FREQ=WEEKLY'
        const startDate = date('2026-01-05') // Monday
        const periodStart = date('2026-01-01')
        const periodEnd = date('2026-01-31')

        const occurrences = getOccurrencesInPeriod(rrule, startDate, periodStart, periodEnd)
        expectDates(occurrences, ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26'])
      })

      it('returns every N weeks', () => {
        const rrule = 'FREQ=WEEKLY;INTERVAL=2'
        const startDate = date('2026-01-05')
        const periodStart = date('2026-01-01')
        const periodEnd = date('2026-02-28')

        const occurrences = getOccurrencesInPeriod(rrule, startDate, periodStart, periodEnd)
        expectDates(occurrences, ['2026-01-05', '2026-01-19', '2026-02-02', '2026-02-16'])
      })

      it('returns specific day of week', () => {
        const rrule = 'FREQ=WEEKLY;BYDAY=FR'
        const startDate = date('2026-01-02') // Friday
        const periodStart = date('2026-01-01')
        const periodEnd = date('2026-01-31')

        const occurrences = getOccurrencesInPeriod(rrule, startDate, periodStart, periodEnd)
        expectDates(occurrences, ['2026-01-02', '2026-01-09', '2026-01-16', '2026-01-23', '2026-01-30'])
      })
    })

    describe('monthly recurrence', () => {
      it('returns every month on same day', () => {
        const rrule = 'FREQ=MONTHLY'
        const startDate = date('2026-01-15')
        const periodStart = date('2026-01-01')
        const periodEnd = date('2026-06-30')

        const occurrences = getOccurrencesInPeriod(rrule, startDate, periodStart, periodEnd)
        expectDates(occurrences, ['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15', '2026-05-15', '2026-06-15'])
      })

      it('returns every N months', () => {
        const rrule = 'FREQ=MONTHLY;INTERVAL=3'
        const startDate = date('2026-01-15')
        const periodStart = date('2026-01-01')
        const periodEnd = date('2026-12-31')

        const occurrences = getOccurrencesInPeriod(rrule, startDate, periodStart, periodEnd)
        expectDates(occurrences, ['2026-01-15', '2026-04-15', '2026-07-15', '2026-10-15'])
      })

      it('returns specific day of month', () => {
        const rrule = 'FREQ=MONTHLY;BYMONTHDAY=1'
        const startDate = date('2026-01-01')
        const periodStart = date('2026-01-01')
        const periodEnd = date('2026-04-30')

        const occurrences = getOccurrencesInPeriod(rrule, startDate, periodStart, periodEnd)
        expectDates(occurrences, ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01'])
      })

      it('handles last day of month', () => {
        const rrule = 'FREQ=MONTHLY;BYMONTHDAY=-1'
        const startDate = date('2026-01-31')
        const periodStart = date('2026-01-01')
        const periodEnd = date('2026-04-30')

        const occurrences = getOccurrencesInPeriod(rrule, startDate, periodStart, periodEnd)
        expectDates(occurrences, ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
      })

      it('handles last day in leap year', () => {
        const rrule = 'FREQ=MONTHLY;BYMONTHDAY=-1'
        const startDate = date('2024-01-31')
        const periodStart = date('2024-01-01')
        const periodEnd = date('2024-04-30')

        const occurrences = getOccurrencesInPeriod(rrule, startDate, periodStart, periodEnd)
        expectDates(occurrences, ['2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30'])
      })

      it('handles day 31 in months with fewer days by falling back to last day', () => {
        const rrule = 'FREQ=MONTHLY;BYMONTHDAY=31'
        const startDate = date('2026-01-31')
        const periodStart = date('2026-01-01')
        const periodEnd = date('2026-06-30')

        const occurrences = getOccurrencesInPeriod(rrule, startDate, periodStart, periodEnd)
        // Falls back to last day of month when 31st doesn't exist
        expectDates(occurrences, ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30'])
      })

      it('handles day 29 in February non-leap year by falling back to 28', () => {
        const rrule = 'FREQ=MONTHLY;BYMONTHDAY=29'
        const startDate = date('2026-01-29')
        const periodStart = date('2026-01-01')
        const periodEnd = date('2026-04-30')

        const occurrences = getOccurrencesInPeriod(rrule, startDate, periodStart, periodEnd)
        // 2026 is not a leap year, so Feb 29 should fall back to Feb 28
        expectDates(occurrences, ['2026-01-29', '2026-02-28', '2026-03-29', '2026-04-29'])
      })

      it('handles day 30 in February by falling back to last day', () => {
        const rrule = 'FREQ=MONTHLY;BYMONTHDAY=30'
        const startDate = date('2026-01-30')
        const periodStart = date('2026-01-01')
        const periodEnd = date('2026-04-30')

        const occurrences = getOccurrencesInPeriod(rrule, startDate, periodStart, periodEnd)
        // Feb doesn't have 30 days, so should fall back to Feb 28
        expectDates(occurrences, ['2026-01-30', '2026-02-28', '2026-03-30', '2026-04-30'])
      })

    })

    describe('yearly recurrence', () => {
      it('returns every year on same date', () => {
        const rrule = 'FREQ=YEARLY'
        const startDate = date('2024-03-15')
        const periodStart = date('2024-01-01')
        const periodEnd = date('2028-12-31')

        const occurrences = getOccurrencesInPeriod(rrule, startDate, periodStart, periodEnd)
        expectDates(occurrences, ['2024-03-15', '2025-03-15', '2026-03-15', '2027-03-15', '2028-03-15'])
      })

      it('returns every N years', () => {
        const rrule = 'FREQ=YEARLY;INTERVAL=2'
        const startDate = date('2024-06-01')
        const periodStart = date('2024-01-01')
        const periodEnd = date('2030-12-31')

        const occurrences = getOccurrencesInPeriod(rrule, startDate, periodStart, periodEnd)
        expectDates(occurrences, ['2024-06-01', '2026-06-01', '2028-06-01', '2030-06-01'])
      })

      it('handles Feb 29 in non-leap years', () => {
        const rrule = 'FREQ=YEARLY'
        const startDate = date('2024-02-29')
        const periodStart = date('2024-01-01')
        const periodEnd = date('2028-12-31')

        const occurrences = getOccurrencesInPeriod(rrule, startDate, periodStart, periodEnd)
        expectDates(occurrences, ['2024-02-29', '2028-02-29'])
      })
    })

    describe('edge cases', () => {
      it('returns empty for empty period', () => {
        const rrule = 'FREQ=DAILY'
        const startDate = date('2026-01-01')
        const periodStart = date('2026-01-10')
        const periodEnd = date('2026-01-05')

        const occurrences = getOccurrencesInPeriod(rrule, startDate, periodStart, periodEnd)
        expect(occurrences).toEqual([])
      })

      it('handles period boundaries inclusively', () => {
        const rrule = 'FREQ=DAILY'
        const startDate = date('2026-01-01')
        const periodStart = date('2026-01-05')
        const periodEnd = date('2026-01-05')

        const occurrences = getOccurrencesInPeriod(rrule, startDate, periodStart, periodEnd)
        expectDates(occurrences, ['2026-01-05'])
      })

      it('respects UNTIL in rrule', () => {
        const rrule = 'FREQ=DAILY;UNTIL=20260110T235959Z'
        const startDate = date('2026-01-01')
        const periodStart = date('2026-01-01')
        const periodEnd = date('2026-01-31')

        const occurrences = getOccurrencesInPeriod(rrule, startDate, periodStart, periodEnd)
        expectDates(occurrences, ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10'])
      })

      it('respects COUNT in rrule', () => {
        const rrule = 'FREQ=WEEKLY;COUNT=3'
        const startDate = date('2026-01-05')
        const periodStart = date('2026-01-01')
        const periodEnd = date('2026-12-31')

        const occurrences = getOccurrencesInPeriod(rrule, startDate, periodStart, periodEnd)
        expectDates(occurrences, ['2026-01-05', '2026-01-12', '2026-01-19'])
      })
    })
  })

  describe('generateLogId', () => {
    it('generates deterministic ID from recurring payment ID and date', () => {
      const recurringPaymentId = 'abc123'
      const scheduledDate = date('2026-01-15')

      const logId = generateLogId(recurringPaymentId, scheduledDate)
      expect(logId).toBe('abc123_2026-01-15')
    })

    it('generates same ID for same inputs', () => {
      const id1 = generateLogId('test', date('2026-03-01'))
      const id2 = generateLogId('test', date('2026-03-01'))
      expect(id1).toBe(id2)
    })

    it('generates different IDs for different dates', () => {
      const id1 = generateLogId('test', date('2026-01-01'))
      const id2 = generateLogId('test', date('2026-01-02'))
      expect(id1).not.toBe(id2)
    })

    it('generates different IDs for different payment IDs', () => {
      const id1 = generateLogId('payment1', date('2026-01-01'))
      const id2 = generateLogId('payment2', date('2026-01-01'))
      expect(id1).not.toBe(id2)
    })
  })

  describe('parseRRule', () => {
    it('parses daily recurrence', () => {
      expect(parseRRule('FREQ=DAILY')).toBe('Daily')
    })

    it('parses daily with interval', () => {
      expect(parseRRule('FREQ=DAILY;INTERVAL=3')).toBe('Every 3 days')
    })

    it('parses weekly recurrence', () => {
      expect(parseRRule('FREQ=WEEKLY')).toBe('Weekly')
    })

    it('parses weekly with interval', () => {
      expect(parseRRule('FREQ=WEEKLY;INTERVAL=2')).toBe('Every 2 weeks')
    })

    it('parses weekly with day', () => {
      expect(parseRRule('FREQ=WEEKLY;BYDAY=MO')).toBe('Weekly on Mon')
    })

    it('parses monthly recurrence', () => {
      expect(parseRRule('FREQ=MONTHLY')).toBe('Monthly')
    })

    it('parses monthly with interval', () => {
      expect(parseRRule('FREQ=MONTHLY;INTERVAL=3')).toBe('Every 3 months')
    })

    it('parses monthly with day of month', () => {
      expect(parseRRule('FREQ=MONTHLY;BYMONTHDAY=15')).toBe('Monthly, 15th')
    })

    it('parses monthly with last day', () => {
      expect(parseRRule('FREQ=MONTHLY;BYMONTHDAY=-1')).toBe('Monthly, last day')
    })

    it('parses yearly recurrence', () => {
      expect(parseRRule('FREQ=YEARLY')).toBe('Yearly')
    })

    it('parses yearly with interval', () => {
      expect(parseRRule('FREQ=YEARLY;INTERVAL=2')).toBe('Every 2 years')
    })
  })

  describe('buildRRule', () => {
    it('builds daily rule', () => {
      const options: RRuleOptions = { frequency: 'daily' }
      expect(buildRRule(options)).toBe('FREQ=DAILY')
    })

    it('builds daily rule with interval', () => {
      const options: RRuleOptions = { frequency: 'daily', interval: 3 }
      expect(buildRRule(options)).toBe('FREQ=DAILY;INTERVAL=3')
    })

    it('builds weekly rule', () => {
      const options: RRuleOptions = { frequency: 'weekly' }
      expect(buildRRule(options)).toBe('FREQ=WEEKLY')
    })

    it('builds weekly rule with interval', () => {
      const options: RRuleOptions = { frequency: 'weekly', interval: 2 }
      expect(buildRRule(options)).toBe('FREQ=WEEKLY;INTERVAL=2')
    })

    it('builds weekly rule with day of week', () => {
      const options: RRuleOptions = { frequency: 'weekly', dayOfWeek: 5 }
      expect(buildRRule(options)).toBe('FREQ=WEEKLY;BYDAY=FR')
    })

    it('builds monthly rule', () => {
      const options: RRuleOptions = { frequency: 'monthly' }
      expect(buildRRule(options)).toBe('FREQ=MONTHLY')
    })

    it('builds monthly rule with interval', () => {
      const options: RRuleOptions = { frequency: 'monthly', interval: 3 }
      expect(buildRRule(options)).toBe('FREQ=MONTHLY;INTERVAL=3')
    })

    it('builds monthly rule with day of month', () => {
      const options: RRuleOptions = { frequency: 'monthly', dayOfMonth: 15 }
      expect(buildRRule(options)).toBe('FREQ=MONTHLY;BYMONTHDAY=15')
    })

    it('builds monthly rule with last day', () => {
      const options: RRuleOptions = { frequency: 'monthly', dayOfMonth: -1 }
      expect(buildRRule(options)).toBe('FREQ=MONTHLY;BYMONTHDAY=-1')
    })

    it('builds yearly rule', () => {
      const options: RRuleOptions = { frequency: 'yearly' }
      expect(buildRRule(options)).toBe('FREQ=YEARLY')
    })

    it('builds yearly rule with interval', () => {
      const options: RRuleOptions = { frequency: 'yearly', interval: 2 }
      expect(buildRRule(options)).toBe('FREQ=YEARLY;INTERVAL=2')
    })

    it('builds rule with end date', () => {
      const options: RRuleOptions = { frequency: 'daily', endDate: date('2026-12-31') }
      expect(buildRRule(options)).toBe('FREQ=DAILY;UNTIL=20261231T120000Z')
    })

    it('builds rule with count', () => {
      const options: RRuleOptions = { frequency: 'weekly', count: 10 }
      expect(buildRRule(options)).toBe('FREQ=WEEKLY;COUNT=10')
    })

    it('interval of 1 is omitted', () => {
      const options: RRuleOptions = { frequency: 'daily', interval: 1 }
      expect(buildRRule(options)).toBe('FREQ=DAILY')
    })
  })
})
