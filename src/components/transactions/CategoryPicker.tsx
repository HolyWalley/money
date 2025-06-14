import type { UseFormReturn } from 'react-hook-form'
import type { CreateTransaction } from '../../../shared/schemas/transaction.schema'
import { Label } from '@/components/ui/label'

import { CategorySelector } from './CategorySelector'

import { useLiveCategories } from '@/hooks/useLiveCategories'

interface CategoriesPickerProps {
  form: UseFormReturn<CreateTransaction>
  isSubmitting: boolean;
}

export function CategoriesPicker({ form, isSubmitting }: CategoriesPickerProps) {
  const transactionType = form.watch('transactionType')
  const { categories } = useLiveCategories()

  return (
    <div className="space-y-2">
      <Label>Category</Label>
      <CategorySelector
        categories={categories
          .filter((category) => category.type === transactionType)
          .sort((a, b) => a.order - b.order)
        }
        selectedCategoryId={form.watch('categoryId')}
        onCategorySelect={(categoryId) => form.setValue('categoryId', categoryId)}
        disabled={isSubmitting}
      />
      {form.formState.errors.categoryId && (
        <p className="text-sm text-destructive">{form.formState.errors.categoryId.message}</p>
      )}
    </div>
  )
}
