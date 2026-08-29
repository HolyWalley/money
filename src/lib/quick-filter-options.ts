import type { QuickFilter, QuickFilterType } from '@/contexts/FilterContext'
import { formatWalletName } from '@/lib/wallet-utils'
import type { Category } from '../../shared/schemas/category.schema'
import type { Wallet } from '../../shared/schemas/wallet.schema'

export interface QuickFilterOption {
  value: string
  label: string
}

export interface QuickFilterGroup {
  type: QuickFilterType
  filters: QuickFilter[]
}

// Chips render in this order rather than in the order they were added, so an
// existing chip never moves when another type is added next to it.
export const QUICK_FILTER_TYPES: QuickFilterType[] = ['wallet', 'category', 'transactionType']

export const QUICK_FILTER_TYPE_LABELS: Record<QuickFilterType, string> = {
  wallet: 'wallet',
  category: 'category',
  transactionType: 'type',
}

const TRANSACTION_TYPE_OPTIONS: QuickFilterOption[] = [
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'transfer', label: 'Transfer' },
]

/**
 * Labels have to match the ones the transaction rows pass to toggleQuickFilter,
 * otherwise the same wallet would read differently depending on where it was
 * picked from.
 */
export function getQuickFilterOptions(
  type: QuickFilterType,
  wallets: Wallet[],
  categories: Category[]
): QuickFilterOption[] {
  switch (type) {
    case 'wallet':
      return wallets.map(wallet => ({ value: wallet._id, label: formatWalletName(wallet) }))
    case 'category':
      return categories.map(category => ({ value: category._id, label: category.name }))
    case 'transactionType':
      return TRANSACTION_TYPE_OPTIONS
  }
}

export function groupQuickFiltersByType(quickFilters: QuickFilter[]): QuickFilterGroup[] {
  return QUICK_FILTER_TYPES
    .map(type => ({ type, filters: quickFilters.filter(filter => filter.type === type) }))
    .filter(group => group.filters.length > 0)
}

export function getUnusedQuickFilterTypes(quickFilters: QuickFilter[]): QuickFilterType[] {
  return QUICK_FILTER_TYPES.filter(
    type => !quickFilters.some(filter => filter.type === type)
  )
}

/**
 * Names the selected values, keeping the chip narrow once there are more than a
 * couple: "Cash, Bank +2".
 */
export function formatQuickFilterValues(filters: QuickFilter[], maxShown = 2): string {
  const shown = filters.slice(0, maxShown).map(filter => filter.label).join(', ')
  const remaining = filters.length - maxShown

  return remaining > 0 ? `${shown} +${remaining}` : shown
}
