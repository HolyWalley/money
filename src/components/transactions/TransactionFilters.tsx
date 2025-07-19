import React from 'react'
import { useForm } from 'react-hook-form'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { MultiSelect } from '@/components/ui/multiselect'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { PeriodFilter } from './PeriodFilter'
import type { TransactionFilters } from '@/hooks/useLiveTransactions'

interface TransactionFiltersProps {
  onFiltersChange: (filters: TransactionFilters) => void
}

export function TransactionFilters({ onFiltersChange }: TransactionFiltersProps) {
  const { watch, setValue, reset } = useForm<TransactionFilters>({
    defaultValues: {
      categoryIds: [],
      walletIds: [],
      period: undefined
    }
  })

  const { categories } = useLiveCategories()
  const { wallets } = useLiveWallets()

  const currentFilters = watch()
  const hasActiveFilters = (currentFilters.categoryIds && currentFilters.categoryIds.length > 0) ||
    (currentFilters.walletIds && currentFilters.walletIds.length > 0) ||
    currentFilters.period !== undefined

  // Watch for changes and notify parent
  React.useEffect(() => {
    onFiltersChange(currentFilters)
  }, [currentFilters.categoryIds, currentFilters.walletIds, currentFilters.period, onFiltersChange])

  const handleCategoryChange = (selected: string[]) => {
    setValue('categoryIds', selected)
  }

  const handleWalletChange = (selected: string[]) => {
    setValue('walletIds', selected)
  }

  const handlePeriodChange = (period: typeof currentFilters.period) => {
    setValue('period', period)
  }

  const clearFilters = () => {
    reset()
  }

  const categoryOptions = categories.map(category => ({
    value: category._id,
    label: category.name
  }))

  const walletOptions = wallets.map(wallet => ({
    value: wallet._id,
    label: wallet.name
  }))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-2 items-center">
          <MultiSelect
            options={categoryOptions}
            selected={currentFilters.categoryIds || []}
            onSelectionChange={handleCategoryChange}
            placeholder="Filter by categories"
            className="flex-1"
          />

          <MultiSelect
            options={walletOptions}
            selected={currentFilters.walletIds || []}
            onSelectionChange={handleWalletChange}
            placeholder="Filter by wallets"
            className="flex-1"
          />
        </div>

        <PeriodFilter
          value={currentFilters.period}
          onChange={handlePeriodChange}
          className="w-full max-w-md"
        />

        {hasActiveFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={clearFilters}
            className="flex items-center gap-1"
          >
            <X className="h-4 w-4" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  )
}
