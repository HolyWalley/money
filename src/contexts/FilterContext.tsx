import { createContext, useContext } from 'react'
import type { TransactionFilters } from '@/hooks/useLiveTransactions'
import type { FilterPage } from '@/lib/filter-persistence'

export type QuickFilterType = 'category' | 'wallet' | 'transactionType'

export interface QuickFilter {
  id: string
  type: QuickFilterType
  value: string
  label: string
}

export interface FilterContextValue {
  savedFilters: TransactionFilters
  baseFilters: TransactionFilters
  quickFilters: QuickFilter[]
  effectiveFilters: TransactionFilters
  hasUnsavedChanges: boolean
  hasQuickFilters: boolean
  updateBaseFilters: (filters: Partial<TransactionFilters>) => void
  saveBaseFilters: () => void
  resetBaseFilters: () => void
  addQuickFilter: (filter: Omit<QuickFilter, 'id'>) => void
  removeQuickFilter: (id: string) => void
  clearQuickFilters: () => void
  toggleQuickFilter: (filter: Omit<QuickFilter, 'id'>) => void
  currentPage: FilterPage
  isLoading: boolean
}

export const FilterContext = createContext<FilterContextValue | null>(null)

export function useFilterContext(): FilterContextValue {
  const context = useContext(FilterContext)
  if (!context) {
    throw new Error('useFilterContext must be used within a FilterProvider')
  }
  return context
}
