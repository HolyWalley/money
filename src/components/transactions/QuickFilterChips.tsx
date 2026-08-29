import { memo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { QuickFilterPicker } from './QuickFilterPicker'
import type { QuickFilter, QuickFilterType } from '@/contexts/FilterContext'
import {
  formatQuickFilterValues,
  getQuickFilterOptions,
  getUnusedQuickFilterTypes,
  groupQuickFiltersByType,
  QUICK_FILTER_TYPE_LABELS,
  type QuickFilterOption,
} from '@/lib/quick-filter-options'
import type { Category } from '../../../shared/schemas/category.schema'
import type { Wallet } from '../../../shared/schemas/wallet.schema'

interface QuickFilterChipsProps {
  quickFilters: QuickFilter[]
  wallets: Wallet[]
  categories: Category[]
  onTypeChange: (type: QuickFilterType, values: QuickFilterOption[]) => void
  onClearAll: () => void
}

function QuickFilterChipsComponent({
  quickFilters,
  wallets,
  categories,
  onTypeChange,
  onClearAll,
}: QuickFilterChipsProps) {
  // Which type the "+" popover is picking values for. Null shows the list of
  // types to choose from instead.
  const [addingType, setAddingType] = useState<QuickFilterType | null>(null)
  const [isAddOpen, setIsAddOpen] = useState(false)

  const groups = groupQuickFiltersByType(quickFilters)
  const unusedTypes = getUnusedQuickFilterTypes(quickFilters)

  const selectValues = (type: QuickFilterType, values: string[]) => {
    const options = getQuickFilterOptions(type, wallets, categories)
    onTypeChange(
      type,
      values
        .map(value => options.find(option => option.value === value))
        .filter((option): option is QuickFilterOption => option !== undefined)
    )
  }

  const handleAddOpenChange = (open: boolean) => {
    setIsAddOpen(open)
    if (!open) {
      setAddingType(null)
    }
  }

  const valuesForType = (type: QuickFilterType) =>
    quickFilters.filter(filter => filter.type === type).map(filter => filter.value)

  if (groups.length === 0) {
    return null
  }

  return (
    <div className="px-4 mb-4">
      <div className="flex flex-wrap items-center gap-2 p-3 bg-secondary/50 border rounded-lg">
        <span className="text-sm text-muted-foreground">Quick filters:</span>

        {groups.map(({ type, filters }) => (
          <Badge key={type} variant="secondary" className="gap-1 pr-1">
            <Popover>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    aria-label={`Edit ${QUICK_FILTER_TYPE_LABELS[type]} filter`}
                    className="flex items-center gap-1 rounded-sm outline-none hover:opacity-80"
                  />
                }
              >
                <span className="text-xs text-muted-foreground">
                  {QUICK_FILTER_TYPE_LABELS[type]}:
                </span>
                {formatQuickFilterValues(filters)}
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-2">
                <QuickFilterPicker
                  idPrefix={`quick-filter-${type}`}
                  options={getQuickFilterOptions(type, wallets, categories)}
                  selected={valuesForType(type)}
                  onSelectionChange={values => selectValues(type, values)}
                />
              </PopoverContent>
            </Popover>

            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${QUICK_FILTER_TYPE_LABELS[type]} filter`}
              className="h-4 w-4 p-0 hover:bg-destructive/20"
              onClick={() => onTypeChange(type, [])}
            >
              <X className="h-3 w-3" />
            </Button>
          </Badge>
        ))}

        <Button variant="ghost" size="sm" onClick={onClearAll} className="h-6 text-xs">
          Clear all
        </Button>

        {/* Pinned right so it keeps its place as chips are added and removed.
            Stays mounted while its popover is open: picking the first value makes
            that type "used", which would otherwise unmount the trigger mid-pick. */}
        {(unusedTypes.length > 0 || isAddOpen) && (
          <Popover open={isAddOpen} onOpenChange={handleAddOpenChange}>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Add filter"
                  className="ml-auto h-6 w-6 p-0"
                />
              }
            >
              <Plus className="h-4 w-4" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-2">
              {addingType === null ? (
                <div className="flex flex-col">
                  {unusedTypes.map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setAddingType(type)}
                      className="rounded-md px-2 py-1.5 text-left text-sm capitalize hover:bg-accent"
                    >
                      {QUICK_FILTER_TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>
              ) : (
                <QuickFilterPicker
                  idPrefix={`quick-filter-add-${addingType}`}
                  options={getQuickFilterOptions(addingType, wallets, categories)}
                  selected={valuesForType(addingType)}
                  onSelectionChange={values => selectValues(addingType, values)}
                />
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  )
}

export const QuickFilterChips = memo(QuickFilterChipsComponent)
