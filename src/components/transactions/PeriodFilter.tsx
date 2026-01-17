import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { TransactionFilters, PeriodFilter as PeriodFilterType } from '@/hooks/useLiveTransactions'
import { FiltersDrawer } from './FiltersDrawer'
import {
  getPeriodContainingDate,
  getAdjacentPeriod,
  isDateInPeriod,
  canNavigate as canNavigatePeriod,
  type PeriodSettings,
} from '@/lib/period-utils'

interface PeriodFilterProps {
  filters: TransactionFilters
  onFiltersChange: (filters: TransactionFilters) => void
  subtitle?: string
  className?: string
}

function toPeriodSettings(period: PeriodFilterType): PeriodSettings {
  return {
    type: period.type,
    monthDay: period.monthDay,
    weekDay: period.weekDay,
    yearDay: period.yearDay,
    customFrom: period.customFrom,
    customTo: period.customTo,
  }
}

const DEFAULT_PERIOD_FILTER: PeriodFilterType = {
  type: 'monthly',
  monthDay: 1,
  currentPeriod: 0,
}

export function PeriodFilter({ filters, subtitle, onFiltersChange, className }: PeriodFilterProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  const currentPeriodFilter = filters.period || DEFAULT_PERIOD_FILTER

  const settings = useMemo(() => toPeriodSettings(currentPeriodFilter), [currentPeriodFilter])
  const offset = currentPeriodFilter.currentPeriod || 0

  const currentPeriod = useMemo(() => {
    const basePeriod = getPeriodContainingDate(new Date(), settings)
    if (offset === 0) return basePeriod
    return getAdjacentPeriod(basePeriod, offset, settings)
  }, [settings, offset])

  const getPeriodLabel = (): string => {
    const { start, end } = currentPeriod

    switch (settings.type) {
      case 'monthly': {
        const monthDay = settings.monthDay ?? 1
        if (monthDay === 1) {
          return format(start, 'MMMM yyyy')
        }
        return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`
      }
      case 'weekly':
        return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`
      case 'yearly': {
        const yearDay = settings.yearDay ?? 1
        if (yearDay === 1) {
          return format(start, 'yyyy')
        }
        return `${format(start, 'MMM d, yyyy')} - ${format(end, 'MMM d, yyyy')}`
      }
      case 'last7days':
        return 'Last 7 days'
      case 'last30days':
        return 'Last 30 days'
      case 'last365days':
        return 'Last 365 days'
      case 'custom':
        return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`
      default:
        return 'All time'
    }
  }

  const handlePrevious = () => {
    if (!canNavigatePeriod(settings)) return

    onFiltersChange({
      ...filters,
      period: {
        ...currentPeriodFilter,
        currentPeriod: offset - 1,
      },
    })
  }

  const handleNext = () => {
    if (!canNavigatePeriod(settings)) return

    onFiltersChange({
      ...filters,
      period: {
        ...currentPeriodFilter,
        currentPeriod: offset + 1,
      },
    })
  }

  const handleDrawerClose = () => {
    setIsDrawerOpen(false)
  }

  const isCurrent = isDateInPeriod(new Date(), currentPeriod)

  return (
    <>
      <div className={cn("flex items-center justify-between rounded-lg border bg-card px-3 py-2", className)}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handlePrevious}
          disabled={!canNavigatePeriod(settings)}
          className="h-8 w-8 p-0 hover:bg-accent"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Previous period</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={() => setIsDrawerOpen(true)}
          className="h-full flex-1 flex-col hover:bg-accent gap-1"
        >
          <div className="flex justify-center font-medium">
            <CalendarIcon className="mr-2 h-4 w-4" />
            <span className={cn(isCurrent && "text-primary")}>
              {getPeriodLabel()}
            </span>
          </div>
          {subtitle && <p className="text-muted-foreground font-light text-xs">{subtitle}</p>}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleNext}
          disabled={!canNavigatePeriod(settings)}
          className="h-8 w-8 p-0 hover:bg-accent"
        >
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Next period</span>
        </Button>
      </div>

      <FiltersDrawer
        filters={filters}
        isOpen={isDrawerOpen}
        currentFilters={filters}
        onClose={handleDrawerClose}
        onFiltersChange={onFiltersChange}
      />
    </>
  )
}
