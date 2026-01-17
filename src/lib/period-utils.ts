import {
  startOfDay,
  endOfDay,
  addDays,
  subDays,
  addMonths,
  addWeeks,
  addYears,
  getDate,
  getDay,
  getDayOfYear,
  setDate,
  setDayOfYear,
  lastDayOfMonth,
} from 'date-fns'

export type PeriodType = 'monthly' | 'weekly' | 'yearly' | 'last7days' | 'last30days' | 'last365days' | 'custom'

export interface PeriodSettings {
  type: PeriodType
  monthDay?: number
  weekDay?: number
  yearDay?: number
  customFrom?: Date
  customTo?: Date
}

export interface Period {
  start: Date
  end: Date
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function getPeriodContainingDate(date: Date, settings: PeriodSettings): Period {
  const d = startOfDay(date)

  switch (settings.type) {
    case 'monthly':
      return getMonthlyPeriod(d, settings.monthDay ?? 1)
    case 'weekly':
      return getWeeklyPeriod(d, settings.weekDay ?? 1)
    case 'yearly':
      return getYearlyPeriod(d, settings.yearDay ?? 1)
    case 'last7days':
      return { start: startOfDay(subDays(d, 6)), end: endOfDay(d) }
    case 'last30days':
      return { start: startOfDay(subDays(d, 29)), end: endOfDay(d) }
    case 'last365days':
      return { start: startOfDay(subDays(d, 364)), end: endOfDay(d) }
    case 'custom':
      return {
        start: startOfDay(settings.customFrom ?? date),
        end: endOfDay(settings.customTo ?? date),
      }
  }
}

function clampMonthDay(date: Date, day: number): number {
  const lastDay = getDate(lastDayOfMonth(date))
  return Math.min(day, lastDay)
}

function getMonthlyPeriod(date: Date, monthDay: number): Period {
  const currentDay = getDate(date)
  const clampedMonthDay = clampMonthDay(date, monthDay)

  let periodStart: Date
  if (currentDay >= clampedMonthDay) {
    periodStart = setDate(date, clampedMonthDay)
  } else {
    const prevMonth = addMonths(date, -1)
    const clampedPrevMonthDay = clampMonthDay(prevMonth, monthDay)
    periodStart = setDate(prevMonth, clampedPrevMonthDay)
  }

  const nextMonth = addMonths(periodStart, 1)
  const clampedNextMonthDay = clampMonthDay(nextMonth, monthDay)
  const nextPeriodStart = setDate(nextMonth, clampedNextMonthDay)
  const periodEnd = subDays(nextPeriodStart, 1)

  return {
    start: startOfDay(periodStart),
    end: endOfDay(periodEnd),
  }
}

function getWeeklyPeriod(date: Date, weekDay: number): Period {
  const currentWeekDay = getDay(date)
  let diff = currentWeekDay - weekDay
  if (diff < 0) diff += 7

  const periodStart = subDays(date, diff)
  const periodEnd = addDays(periodStart, 6)

  return {
    start: startOfDay(periodStart),
    end: endOfDay(periodEnd),
  }
}

function clampYearDay(date: Date, day: number): number {
  const year = date.getFullYear()
  const maxDay = isLeapYear(year) ? 366 : 365
  return Math.min(day, maxDay)
}

function getYearlyPeriod(date: Date, yearDay: number): Period {
  const currentYearDay = getDayOfYear(date)
  const clampedYearDay = clampYearDay(date, yearDay)

  let periodStart: Date
  if (currentYearDay >= clampedYearDay) {
    periodStart = setDayOfYear(date, clampedYearDay)
  } else {
    const prevYear = addYears(date, -1)
    const clampedPrevYearDay = clampYearDay(prevYear, yearDay)
    periodStart = setDayOfYear(prevYear, clampedPrevYearDay)
  }

  const nextYear = addYears(periodStart, 1)
  const clampedNextYearDay = clampYearDay(nextYear, yearDay)
  const nextPeriodStart = setDayOfYear(nextYear, clampedNextYearDay)
  const periodEnd = subDays(nextPeriodStart, 1)

  return {
    start: startOfDay(periodStart),
    end: endOfDay(periodEnd),
  }
}

export function getAdjacentPeriod(currentPeriod: Period, offset: number, settings: PeriodSettings): Period {
  if (offset === 0) return currentPeriod

  switch (settings.type) {
    case 'monthly': {
      const newDate = addMonths(currentPeriod.start, offset)
      return getMonthlyPeriod(newDate, settings.monthDay ?? 1)
    }
    case 'weekly': {
      const newDate = addWeeks(currentPeriod.start, offset)
      return getWeeklyPeriod(newDate, settings.weekDay ?? 1)
    }
    case 'yearly': {
      const newDate = addYears(currentPeriod.start, offset)
      return getYearlyPeriod(newDate, settings.yearDay ?? 1)
    }
    case 'last7days':
    case 'last30days':
    case 'last365days':
    case 'custom':
      return currentPeriod
  }
}

export function isDateInPeriod(date: Date, period: Period): boolean {
  const d = startOfDay(date)
  const start = startOfDay(period.start)
  const end = startOfDay(period.end)
  return d >= start && d <= end
}

export function canNavigate(settings: PeriodSettings): boolean {
  return ['monthly', 'weekly', 'yearly'].includes(settings.type)
}
