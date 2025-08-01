import { useFormContext } from 'react-hook-form'
import type { CreateTransaction } from '../../../shared/schemas/transaction.schema'
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form'
import { CategorySelector } from './CategorySelector'
import { useLiveCategories } from '@/hooks/useLiveCategories'

interface CategoriesPickerProps {
  isSubmitting: boolean;
}

export function CategoriesPicker({ isSubmitting }: CategoriesPickerProps) {
  const form = useFormContext<CreateTransaction>()
  const transactionType = form.watch('transactionType')
  const { categories } = useLiveCategories(transactionType)

  return (
    <FormField
      control={form.control}
      name="categoryId"
      render={({ field }) => (
        <FormItem>
          <FormControl>
            <CategorySelector
              categories={categories}
              selectedCategoryId={field.value}
              onCategorySelect={field.onChange}
              disabled={isSubmitting}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
