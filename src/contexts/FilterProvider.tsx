import { useState, useEffect, useMemo, useCallback, useTransition, type ReactNode } from 'react'
import { FilterContext, type QuickFilter, type QuickFilterType } from './FilterContext'
import type { TransactionFilters } from '@/hooks/useLiveTransactions'
import type { FilterPage } from '@/lib/filter-persistence'
import { filterPersistence } from '@/lib/filter-persistence'
import type { Wallet } from '../../shared/schemas/wallet.schema'
import type { Category } from '../../shared/schemas/category.schema'

interface FilterProviderProps {
  page: FilterPage
  children: ReactNode
  wallets: Wallet[]
  categories: Category[]
}

// A type/value pair can only be selected once, so it doubles as a stable key.
function quickFilterId(type: QuickFilterType, value: string): string {
  return `${type}-${value}`
}

export function mergeFilters(base: TransactionFilters, quick: QuickFilter[]): TransactionFilters {
  if (quick.length === 0) {
    return base
  }

  const quickCategories = quick
    .filter(f => f.type === 'category')
    .map(f => f.value)

  const quickWallets = quick
    .filter(f => f.type === 'wallet')
    .map(f => f.value)

  const quickTypes = quick
    .filter(f => f.type === 'transactionType')
    .map(f => f.value)

  return {
    ...base,
    categoryIds: quickCategories.length > 0 ? quickCategories : base.categoryIds,
    walletIds: quickWallets.length > 0 ? quickWallets : base.walletIds,
    transactionTypeIds: quickTypes.length > 0 ? quickTypes : base.transactionTypeIds,
  }
}

function getDefaultFilters(
  wallets: Wallet[],
  categories: Category[]
): TransactionFilters {
  return {
    categoryIds: categories.map(c => c._id),
    walletIds: wallets.map(w => w._id),
    transactionTypeIds: ['income', 'expense', 'transfer'],
    period: {
      type: 'monthly',
      currentPeriod: 0,
      monthDay: 1,
    },
  }
}

export function FilterProvider({ page, children, wallets, categories }: FilterProviderProps) {
  const [savedFilters, setSavedFilters] = useState<TransactionFilters>(
    () => filterPersistence.loadFilters(page) ?? getDefaultFilters(wallets, categories)
  )
  const [baseFilters, setBaseFilters] = useState<TransactionFilters>(savedFilters)
  const [quickFilters, setQuickFilters] = useState<QuickFilter[]>([])
  // Every change of filters is a change of rows, and the rows are memos over a
  // store that answers at once; the transition is what keeps the current rows
  // on screen while the new ones are selected, instead of the page's fallback.
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (JSON.stringify(baseFilters) === JSON.stringify(savedFilters)) {
      return
    }

    const saveTimer = setTimeout(() => {
      filterPersistence.saveFilters(page, baseFilters)
      setSavedFilters(baseFilters)
    }, 500)

    return () => clearTimeout(saveTimer)
  }, [baseFilters, savedFilters, page])

  const effectiveFilters = useMemo(
    () => mergeFilters(baseFilters, quickFilters),
    [baseFilters, quickFilters]
  )

  const updateBaseFilters = useCallback((updates: Partial<TransactionFilters>) => {
    startTransition(() => {
      setBaseFilters(prev => ({ ...prev, ...updates }))
    })
  }, [])

  const saveBaseFilters = useCallback(() => {
    filterPersistence.saveFilters(page, baseFilters)
    setSavedFilters(baseFilters)
  }, [page, baseFilters])

  const resetBaseFilters = useCallback(() => {
    startTransition(() => {
      setBaseFilters(savedFilters)
    })
  }, [savedFilters])

  const clearQuickFilters = useCallback(() => {
    startTransition(() => {
      setQuickFilters([])
    })
  }, [])

  const toggleQuickFilter = useCallback((filter: Omit<QuickFilter, 'id'>) => {
    startTransition(() => {
      setQuickFilters(prev => {
        const exists = prev.find(
          f => f.type === filter.type && f.value === filter.value
        )

        if (exists) {
          return prev.filter(f => f.id !== exists.id)
        }

        return [...prev, { ...filter, id: quickFilterId(filter.type, filter.value) }]
      })
    })
  }, [])

  // Replaces every value of one type at once, which is what the chip's
  // multiselect edits: the picker owns the whole selection, not one value.
  const setQuickFiltersForType = useCallback((
    type: QuickFilterType,
    values: Omit<QuickFilter, 'id' | 'type'>[]
  ) => {
    startTransition(() => {
      setQuickFilters(prev => [
        ...prev.filter(f => f.type !== type),
        ...values.map(value => ({ ...value, type, id: quickFilterId(type, value.value) })),
      ])
    })
  }, [])

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(baseFilters) !== JSON.stringify(savedFilters),
    [baseFilters, savedFilters]
  )

  const hasQuickFilters = quickFilters.length > 0

  const value = useMemo(
    () => ({
      savedFilters,
      baseFilters,
      quickFilters,
      effectiveFilters,
      hasUnsavedChanges,
      hasQuickFilters,
      updateBaseFilters,
      saveBaseFilters,
      resetBaseFilters,
      clearQuickFilters,
      toggleQuickFilter,
      setQuickFiltersForType,
      currentPage: page,
      isPending,
    }),
    [
      savedFilters,
      baseFilters,
      quickFilters,
      effectiveFilters,
      hasUnsavedChanges,
      hasQuickFilters,
      updateBaseFilters,
      saveBaseFilters,
      resetBaseFilters,
      clearQuickFilters,
      toggleQuickFilter,
      setQuickFiltersForType,
      page,
      isPending,
    ]
  )

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
}
