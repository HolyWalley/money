import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { QuickFilter } from '@/contexts/FilterContext'

interface QuickFilterChipsProps {
  quickFilters: QuickFilter[]
  onRemove: (id: string) => void
  onClearAll: () => void
}

const typeLabels: Record<string, string> = {
  category: 'category',
  wallet: 'wallet',
  transactionType: 'type',
}

export function QuickFilterChips({ quickFilters, onRemove, onClearAll }: QuickFilterChipsProps) {
  if (quickFilters.length === 0) return null

  return (
    <div className="px-4 mb-4">
      <div className="flex flex-wrap items-center gap-2 p-3 bg-secondary/50 border rounded-lg">
        <span className="text-sm text-muted-foreground">Quick filters:</span>

        {quickFilters.map(filter => (
          <Badge key={filter.id} variant="secondary" className="gap-1 pr-1">
            <span className="text-xs text-muted-foreground">
              {typeLabels[filter.type]}:
            </span>
            {filter.label}
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 p-0 hover:bg-destructive/20"
              onClick={() => onRemove(filter.id)}
            >
              <X className="h-3 w-3" />
            </Button>
          </Badge>
        ))}

        <Button variant="ghost" size="sm" onClick={onClearAll} className="h-6 text-xs">
          Clear all
        </Button>
      </div>
    </div>
  )
}
