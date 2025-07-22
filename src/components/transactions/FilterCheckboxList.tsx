import type { ReactNode } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

interface FilterCheckboxListProps<T> {
  items: T[]
  selectedIds: string[]
  onChange: (id: string, checked: boolean) => void
  onSelectAll?: (ids: string[], selected: boolean) => void
  label: string
  getItemId: (item: T) => string
  renderItem?: (item: T) => ReactNode
  getItemLabel?: (item: T) => string
}

export function FilterCheckboxList<T>({
  items,
  selectedIds,
  onChange,
  onSelectAll,
  label,
  getItemId,
  renderItem,
  getItemLabel
}: FilterCheckboxListProps<T>) {
  const allIds = items.map(getItemId)
  const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.includes(id))

  const handleSelectAll = () => {
    if (onSelectAll) {
      onSelectAll(allIds, !allSelected)
    } else {
      // Fallback to individual onChange calls
      if (allSelected) {
        allIds.forEach(id => onChange(id, false))
      } else {
        allIds.forEach(id => onChange(id, true))
      }
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-lg font-medium">{label}</Label>
        <button
          type="button"
          onClick={handleSelectAll}
          className="text-sm text-primary hover:text-primary/80 underline-offset-4 hover:underline"
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const itemId = getItemId(item)
          const isChecked = selectedIds.includes(itemId)

          return (
            <div key={itemId} className="flex items-center space-x-2">
              <Checkbox
                id={`${label.toLowerCase()}-${itemId}`}
                checked={isChecked}
                onCheckedChange={(checked) => onChange(itemId, !!checked)}
                className="size-5"
              />
              <Label
                htmlFor={`${label.toLowerCase()}-${itemId}`}
                className="text-base font-normal cursor-pointer flex-1"
              >
                {renderItem ? renderItem(item) : getItemLabel?.(item)}
              </Label>
            </div>
          )
        })}
      </div>
    </div>
  )
}
