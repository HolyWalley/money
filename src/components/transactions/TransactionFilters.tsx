import React from 'react'
import { useForm } from 'react-hook-form'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { MultiSelect } from '@/components/ui/multiselect'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import type { TransactionFilters } from '@/hooks/useLiveTransactions'

interface TransactionFiltersProps {
  onFiltersChange: (filters: TransactionFilters) => void
}

export function TransactionFilters({ onFiltersChange }: TransactionFiltersProps) {
  const { watch, setValue, reset } = useForm<TransactionFilters>({
    defaultValues: {
      categoryIds: [],
      walletIds: []
    }
  })

  const { categories } = useLiveCategories()
  const { wallets } = useLiveWallets()

  const currentFilters = watch()
  const hasActiveFilters = (currentFilters.categoryIds && currentFilters.categoryIds.length > 0) || 
                          (currentFilters.walletIds && currentFilters.walletIds.length > 0)

  // Watch for changes and notify parent
  React.useEffect(() => {
    onFiltersChange(currentFilters)
  }, [currentFilters.categoryIds, currentFilters.walletIds, onFiltersChange])

  const handleCategoryChange = (selected: string[]) => {
    setValue('categoryIds', selected)
  }

  const handleWalletChange = (selected: string[]) => {
    setValue('walletIds', selected)
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
    <div className="flex flex-wrap gap-3 items-center">
      <MultiSelect
        options={categoryOptions}
        selected={currentFilters.categoryIds || []}
        onSelectionChange={handleCategoryChange}
        placeholder="Filter by categories"
        className="w-[200px]"
      />

      <MultiSelect
        options={walletOptions}
        selected={currentFilters.walletIds || []}
        onSelectionChange={handleWalletChange}
        placeholder="Filter by wallets"
        className="w-[200px]"
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
  )
}
