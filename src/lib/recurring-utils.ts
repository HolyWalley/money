import { RRule } from 'rrule'
import { format } from 'date-fns'

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

function toUTCMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0))
}

function fromUTCToLocal(date: Date): Date {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0, 0)
}

export interface RRuleOptions {
  frequency: Frequency
  interval?: number
  dayOfWeek?: number
  dayOfMonth?: number
  endDate?: Date
  count?: number
}

const FREQ_REVERSE_MAP: Record<number, Frequency> = {
  [RRule.DAILY]: 'daily',
  [RRule.WEEKLY]: 'weekly',
  [RRule.MONTHLY]: 'monthly',
  [RRule.YEARLY]: 'yearly',
}

const DAY_ABBR_JS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const DAY_NAMES_RRULE = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function getOccurrencesInPeriod(
  rruleString: string,
  startDate: Date,
  periodStart: Date,
  periodEnd: Date
): Date[] {
  if (periodEnd < periodStart) {
    return []
  }

  const rule = RRule.fromString(rruleString)
  const options = {
    ...rule.origOptions,
    dtstart: toUTCMidnight(startDate),
  }
  const ruleWithStart = new RRule(options)

  const utcOccurrences = ruleWithStart.between(
    toUTCMidnight(periodStart),
    toUTCMidnight(periodEnd),
    true
  )

  return utcOccurrences.map(fromUTCToLocal)
}

export function generateLogId(recurringPaymentId: string, scheduledDate: Date): string {
  const dateStr = format(scheduledDate, 'yyyy-MM-dd')
  return `${recurringPaymentId}_${dateStr}`
}

export function parseRRule(rruleString: string): string {
  const rule = RRule.fromString(rruleString)
  const options = rule.origOptions
  const freq = FREQ_REVERSE_MAP[options.freq!]
  const interval = options.interval || 1

  let base: string
  switch (freq) {
    case 'daily':
      base = interval === 1 ? 'Every day' : `Every ${interval} days`
      break
    case 'weekly':
      base = interval === 1 ? 'Every week' : `Every ${interval} weeks`
      if (options.byweekday) {
        const byweekday = Array.isArray(options.byweekday) ? options.byweekday : [options.byweekday]
        if (byweekday.length > 0) {
          const day = byweekday[0]
          const dayNum = typeof day === 'number' ? day : (day as { weekday: number }).weekday
          base += ` on ${DAY_NAMES_RRULE[dayNum]}`
        }
      }
      break
    case 'monthly':
      base = interval === 1 ? 'Every month' : `Every ${interval} months`
      if (options.bymonthday) {
        const bymonthday = Array.isArray(options.bymonthday) ? options.bymonthday : [options.bymonthday]
        if (bymonthday.length > 0) {
          const day = bymonthday[0]
          if (day === -1) {
            base += ' on the last day'
          } else {
            base += ` on day ${day}`
          }
        }
      }
      break
    case 'yearly':
      base = interval === 1 ? 'Every year' : `Every ${interval} years`
      break
    default:
      base = 'Unknown frequency'
  }

  return base
}

export function buildRRule(options: RRuleOptions): string {
  const parts: string[] = []

  parts.push(`FREQ=${options.frequency.toUpperCase()}`)

  if (options.interval && options.interval > 1) {
    parts.push(`INTERVAL=${options.interval}`)
  }

  if (options.frequency === 'weekly' && options.dayOfWeek !== undefined) {
    parts.push(`BYDAY=${DAY_ABBR_JS[options.dayOfWeek]}`)
  }

  if (options.frequency === 'monthly' && options.dayOfMonth !== undefined) {
    parts.push(`BYMONTHDAY=${options.dayOfMonth}`)
  }

  if (options.endDate) {
    const until = format(options.endDate, "yyyyMMdd'T'HHmmss'Z'")
    parts.push(`UNTIL=${until}`)
  }

  if (options.count) {
    parts.push(`COUNT=${options.count}`)
  }

  return parts.join(';')
}
