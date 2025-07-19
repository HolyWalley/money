import { useState } from 'react'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfYear, endOfYear, addMonths, addWeeks, addYears, subDays, isToday, setDate, setDay, setDayOfYear, startOfDay, endOfDay } from 'date-fns'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PeriodFilter, PeriodType } from '@/hooks/useLiveTransactions'
import { PeriodFilterDrawer } from './PeriodFilterDrawer'

interface PeriodFilterProps {
  value?: PeriodFilter
  onChange: (period: PeriodFilter | undefined) => void
  className?: string
}

export function PeriodFilter({ value, onChange, className }: PeriodFilterProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  // Default to current month if no value
  const currentPeriod = value || {
    type: 'monthly' as PeriodType,
    startDate: new Date(),
    currentPeriod: 0
  }

  const getPeriodDates = (period: PeriodFilter): { start: Date; end: Date } => {
    const baseDate = period.startDate || new Date()
    const offset = period.currentPeriod || 0

    switch (period.type) {
      case 'monthly': {
        const targetDate = addMonths(baseDate, offset)
        const monthStart = startOfMonth(targetDate)
        const actualStart = period.monthDay ? setDate(monthStart, period.monthDay) : monthStart
        return {
          start: startOfDay(actualStart),
          end: endOfDay(endOfMonth(targetDate))
        }
      }
      case 'weekly': {
        const targetDate = addWeeks(baseDate, offset)
        const weekStart = startOfWeek(targetDate)
        const actualStart = period.weekDay !== undefined ? setDay(weekStart, period.weekDay) : weekStart
        return {
          start: startOfDay(actualStart),
          end: endOfDay(endOfWeek(targetDate))
        }
      }
      case 'yearly': {
        const targetDate = addYears(baseDate, offset)
        const yearStart = startOfYear(targetDate)
        const actualStart = period.yearDay ? setDayOfYear(yearStart, period.yearDay) : yearStart
        return {
          start: startOfDay(actualStart),
          end: endOfDay(endOfYear(targetDate))
        }
      }
      case 'last7days': {
        const end = new Date()
        const start = subDays(end, 6)
        return { start, end }
      }
      case 'last30days': {
        const end = new Date()
        const start = subDays(end, 29)
        return { start, end }
      }
      case 'last365days': {
        const end = new Date()
        const start = subDays(end, 364)
        return { start, end }
      }
      case 'custom': {
        return {
          start: period.customFrom || new Date(),
          end: period.customTo || new Date()
        }
      }
      default:
        return { start: new Date(), end: new Date() }
    }
  }

  const getPeriodLabel = (period: PeriodFilter): string => {
    const { start, end } = getPeriodDates(period)
    
    switch (period.type) {
      case 'monthly':
        return format(start, 'MMMM yyyy')
      case 'weekly':
        return `${format(start, 'MMM dd')} - ${format(end, 'MMM dd, yyyy')}`
      case 'yearly':
        return format(start, 'yyyy')
      case 'last7days':
        return 'Last 7 days'
      case 'last30days':
        return 'Last 30 days'
      case 'last365days':
        return 'Last 365 days'
      case 'custom':
        return `${format(start, 'MMM dd')} - ${format(end, 'MMM dd, yyyy')}`
      default:
        return 'All time'
    }
  }

  const canNavigate = (period: PeriodFilter): boolean => {
    return ['monthly', 'weekly', 'yearly'].includes(period.type)
  }

  const handlePrevious = () => {
    if (!canNavigate(currentPeriod)) return
    
    const newPeriod = {
      ...currentPeriod,
      currentPeriod: (currentPeriod.currentPeriod || 0) - 1
    }
    onChange(newPeriod)
  }

  const handleNext = () => {
    if (!canNavigate(currentPeriod)) return
    
    const newPeriod = {
      ...currentPeriod,
      currentPeriod: (currentPeriod.currentPeriod || 0) + 1
    }
    onChange(newPeriod)
  }

  const handleDrawerClose = (selectedPeriod?: PeriodFilter) => {
    setIsDrawerOpen(false)
    if (selectedPeriod) {
      onChange(selectedPeriod)
    }
  }

  const isCurrentPeriod = () => {
    if (!canNavigate(currentPeriod)) return false
    return (currentPeriod.currentPeriod || 0) === 0
  }

  return (
    <>
      <div className={cn("flex items-center justify-between rounded-lg border bg-card px-3 py-2", className)}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handlePrevious}
          disabled={!canNavigate(currentPeriod)}
          className="h-8 w-8 p-0 hover:bg-accent"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Previous period</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={() => setIsDrawerOpen(true)}
          className="flex-1 justify-center font-medium hover:bg-accent"
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          <span className={cn(isCurrentPeriod() && isToday(new Date()) && "text-primary")}>
            {getPeriodLabel(currentPeriod)}
          </span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleNext}
          disabled={!canNavigate(currentPeriod) || isCurrentPeriod()}
          className="h-8 w-8 p-0 hover:bg-accent"
        >
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Next period</span>
        </Button>
      </div>

      <PeriodFilterDrawer
        isOpen={isDrawerOpen}
        currentPeriod={currentPeriod}
        onClose={handleDrawerClose}
      />
    </>
  )
}
