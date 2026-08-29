import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from 'react'
import { FilterContext, type QuickFilter, type QuickFilterType } from './FilterContext'
import type { TransactionFilters } from '@/hooks/useLiveTransactions'
import type { FilterPage } from '@/lib/filter-persistence'
import { filterPersistence } from '@/lib/filter-persistence'
import type { Wallet } from '../../shared/schemas/wallet.schema'
import type { Category } from '../../shared/schemas/category.schema'

interface FilterProviderProps {
  page: FilterPage
  children: ReactNode
  wallets: {
    wallets: Wallet[]
    isLoading: boolean
  }
  categories: {
    categories: Category[]
    isLoading: boolean
  }
}

// A type/value pair can only be selected once, so it doubles as a stable key.
function quickFilterId(type: QuickFilterType, value: string): string {
  return `${type}-${value}`
}

function mergeFilters(base: TransactionFilters, quick: QuickFilter[]): TransactionFilters {
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
    filterVersion: Date.now().toString(),
  }
}

function getDefaultFilters(
  wallets: Wallet[],
  categories: Category[]
): TransactionFilters {
  return {
    isLoading: false,
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
  const [initialized, setInitialized] = useState(false)
  const [savedFilters, setSavedFilters] = useState<TransactionFilters>({ isLoading: true })
  const [baseFilters, setBaseFilters] = useState<TransactionFilters>({ isLoading: true })
  const [quickFilters, setQuickFilters] = useState<QuickFilter[]>([])
  const saveTimerRef = useRef<NodeJS.Timeout | undefined>(undefined)

  const isLoading = wallets.isLoading || categories.isLoading

  useEffect(() => {
    if (initialized || isLoading) {
      return
    }

    const defaultFilters = getDefaultFilters(wallets.wallets, categories.categories)
    const loadedFilters = filterPersistence.loadFilters(page)

    const filtersToUse = loadedFilters || defaultFilters

    setSavedFilters(filtersToUse)
    setBaseFilters(filtersToUse)
    setInitialized(true)
  }, [initialized, isLoading, page, wallets.wallets, categories.categories])

  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }

    if (isLoading || !initialized) {
      return
    }

    if (JSON.stringify(baseFilters) === JSON.stringify(savedFilters)) {
      return
    }

    saveTimerRef.current = setTimeout(() => {
      filterPersistence.saveFilters(page, baseFilters)
      setSavedFilters(baseFilters)
    }, 500)

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
    }
  }, [baseFilters, savedFilters, page, isLoading, initialized])

  const effectiveFilters = useMemo(
    () => mergeFilters(baseFilters, quickFilters),
    [baseFilters, quickFilters]
  )

  const updateBaseFilters = useCallback((updates: Partial<TransactionFilters>) => {
    setBaseFilters(prev => ({
      ...prev,
      ...updates,
      filterVersion: Date.now().toString(),
    }))
  }, [])

  const saveBaseFilters = useCallback(() => {
    filterPersistence.saveFilters(page, baseFilters)
    setSavedFilters(baseFilters)
  }, [page, baseFilters])

  const resetBaseFilters = useCallback(() => {
    setBaseFilters(savedFilters)
  }, [savedFilters])

  const clearQuickFilters = useCallback(() => {
    setQuickFilters([])
  }, [])

  const toggleQuickFilter = useCallback((filter: Omit<QuickFilter, 'id'>) => {
    setQuickFilters(prev => {
      const exists = prev.find(
        f => f.type === filter.type && f.value === filter.value
      )

      if (exists) {
        return prev.filter(f => f.id !== exists.id)
      }

      return [...prev, { ...filter, id: quickFilterId(filter.type, filter.value) }]
    })
  }, [])

  // Replaces every value of one type at once, which is what the chip's
  // multiselect edits: the picker owns the whole selection, not one value.
  const setQuickFiltersForType = useCallback((
    type: QuickFilterType,
    values: Omit<QuickFilter, 'id' | 'type'>[]
  ) => {
    setQuickFilters(prev => [
      ...prev.filter(f => f.type !== type),
      ...values.map(value => ({ ...value, type, id: quickFilterId(type, value.value) })),
    ])
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
      isLoading,
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
      isLoading,
    ]
  )

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
}
