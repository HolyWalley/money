import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { QuickFilterOption } from '@/lib/quick-filter-options'

interface QuickFilterPickerProps {
  options: QuickFilterOption[]
  selected: string[]
  onSelectionChange: (selected: string[]) => void
  idPrefix: string
}

export function QuickFilterPicker({
  options,
  selected,
  onSelectionChange,
  idPrefix,
}: QuickFilterPickerProps) {
  const allSelected = options.length > 0 && options.every(option => selected.includes(option.value))

  const toggle = (value: string) => {
    onSelectionChange(
      selected.includes(value)
        ? selected.filter(item => item !== value)
        : [...selected, value]
    )
  }

  if (options.length === 0) {
    return (
      <p className="px-2 py-1.5 text-sm text-muted-foreground">Nothing to filter by.</p>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="text-xs text-muted-foreground">
          {selected.length} of {options.length}
        </span>
        <button
          type="button"
          onClick={() => onSelectionChange(allSelected ? [] : options.map(option => option.value))}
          className="text-xs text-primary underline-offset-4 hover:underline"
        >
          {allSelected ? 'Clear' : 'Select all'}
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto overscroll-contain">
        {options.map(option => {
          const id = `${idPrefix}-${option.value}`

          return (
            <div key={option.value} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
              <Checkbox
                id={id}
                checked={selected.includes(option.value)}
                onCheckedChange={() => toggle(option.value)}
              />
              <Label htmlFor={id} className="flex-1 cursor-pointer text-sm font-normal">
                {option.label}
              </Label>
            </div>
          )
        })}
      </div>
    </div>
  )
}
