import { useState, useMemo, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Search, X } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
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
  onExportCsv?: () => void
  subtitle?: string
  className?: string
  searchTerm?: string
  onSearchChange?: (term: string) => void
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

export function PeriodFilter({ filters, subtitle, onFiltersChange, onExportCsv, className, searchTerm = '', onSearchChange }: PeriodFilterProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus()
    }
  }, [isSearchOpen])

  // Closing drops the term rather than hiding it: a search still narrowing the
  // list from behind a collapsed field is a list that looks wrong for no reason.
  const closeSearch = () => {
    setIsSearchOpen(false)
    onSearchChange?.('')
  }

  const isCurrent = isDateInPeriod(new Date(), currentPeriod)

  return (
    <>
      <div className="flex items-stretch gap-2">
        <div className={cn("flex flex-1 items-center justify-between rounded-lg border bg-card px-3 py-2", className)}>
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

        {/* Its own control beside the card rather than a fourth button inside
            it: the card is a three-part navigator, and a magnifier sitting
            between the chevrons reads as part of that navigation. */}
        {onSearchChange && (
          <Button
            type="button"
            variant="outline"
            aria-label={isSearchOpen ? 'Close search' : 'Search transactions'}
            onClick={() => (isSearchOpen ? closeSearch() : setIsSearchOpen(true))}
            className="h-auto w-10 px-0 bg-card dark:bg-card"
          >
            {isSearchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          </Button>
        )}
      </div>

      {/* Below the card, not in place of it: the period is what bounds the
          results, so it stays readable while the search narrows them. */}
      {onSearchChange && isSearchOpen && (
        <InputGroup className="mt-2">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchInputRef}
            value={searchTerm}
            placeholder="Search notes or amount"
            onChange={event => onSearchChange(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                closeSearch()
              }
            }}
          />
          {searchTerm && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label="Clear search"
                onClick={() => onSearchChange('')}
              >
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
      )}

      <FiltersDrawer
        filters={filters}
        isOpen={isDrawerOpen}
        currentFilters={filters}
        onClose={handleDrawerClose}
        onFiltersChange={onFiltersChange}
        onExportCsv={onExportCsv}
      />
    </>
  )
}
