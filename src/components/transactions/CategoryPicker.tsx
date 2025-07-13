import { useFormContext } from 'react-hook-form'
import type { CreateTransaction } from '../../../shared/schemas/transaction.schema'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
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
  const { categories } = useLiveCategories()

  return (
    <FormField
      control={form.control}
      name="categoryId"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Category</FormLabel>
          <FormControl>
            <CategorySelector
              categories={categories
                .filter((category) => category.type === transactionType)
                .sort((a, b) => a.order - b.order)
              }
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
