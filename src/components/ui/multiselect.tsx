import * as React from 'react'
import { ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'

interface Option {
  value: string
  label: string
}

interface MultiSelectProps {
  options: Option[]
  selected: string[]
  onSelectionChange: (selected: string[]) => void
  placeholder?: string
  className?: string
}

export function MultiSelect({
  options,
  selected,
  onSelectionChange,
  placeholder = 'Select items...',
  className
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)

  const isAllSelected = options.length > 0 && selected.length === options.length
  const isIndeterminate = selected.length > 0 && selected.length < options.length

  const handleSelect = (value: string) => {
    const newSelected = selected.includes(value)
      ? selected.filter(item => item !== value)
      : [...selected, value]
    onSelectionChange(newSelected)
  }

  const handleSelectAll = () => {
    if (isAllSelected) {
      onSelectionChange([])
    } else {
      onSelectionChange(options.map(option => option.value))
    }
  }

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onSelectionChange([])
  }

  const selectedLabels = selected
    .map(value => options.find(option => option.value === value)?.label)
    .filter(Boolean)

  const displayText = selectedLabels.length === 0
    ? placeholder
    : isAllSelected
      ? 'All selected'
      : selectedLabels.length === 1
        ? selectedLabels[0]
        : `${selectedLabels.length} selected`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'justify-between',
            className
          )}
        >
          <span className="truncate">{displayText}</span>
          <div className="flex items-center gap-1">
            {selected.length > 0 && (
              <X
                className="h-4 w-4 opacity-50 hover:opacity-100"
                onClick={handleClear}
              />
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <div className="max-h-60 overflow-auto">
          {options.length > 0 && (
            <>
              <div
                className="flex items-center space-x-2 px-3 py-2 hover:bg-accent cursor-pointer border-b"
                onClick={handleSelectAll}
              >
                <div className="relative">
                  <Checkbox
                    checked={isAllSelected}
                    onChange={handleSelectAll}
                  />
                  {isIndeterminate && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-2 h-0.5 bg-primary rounded" />
                    </div>
                  )}
                </div>
                <span className="text-sm font-medium">Select All</span>
              </div>
              {options.map((option) => (
                <div
                  key={option.value}
                  className="flex items-center space-x-2 px-3 py-2 hover:bg-accent cursor-pointer"
                  onClick={() => handleSelect(option.value)}
                >
                  <Checkbox
                    checked={selected.includes(option.value)}
                    onChange={() => handleSelect(option.value)}
                  />
                  <span className="text-sm">{option.label}</span>
                </div>
              ))}
            </>
          )}
          {options.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No options available
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
