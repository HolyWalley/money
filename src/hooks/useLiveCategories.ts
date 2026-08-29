import { db, type DexieCategory } from '@/lib/db-dexie'
import { createKeyedSharedLiveQuery } from '@/lib/shared-live-query'
import type { Category } from '../../shared/schemas/category.schema'

// TODO: create a transaction type enum-type

const EMPTY_CATEGORIES: Category[] = []

const ALL_TYPES = 'all'

const useSharedCategories = createKeyedSharedLiveQuery(async (type: string) => {
  let dexieCategories: DexieCategory[]
  if (type === ALL_TYPES) {
    dexieCategories = await db.categories.orderBy('order').toArray()
  } else {
    dexieCategories = await db.categories.where('type').equals(type).sortBy('order')
  }
  // Convert Date objects back to ISO strings for components
  return dexieCategories.map(cat => ({
    ...cat,
    createdAt: cat.createdAt.toISOString(),
    updatedAt: cat.updatedAt.toISOString()
  })) as Category[]
})

export function useLiveCategories(type?: 'expense' | 'income' | 'transfer') {
  const categories = useSharedCategories(type ?? ALL_TYPES)

  return {
    categories: categories || EMPTY_CATEGORIES,
    isLoading: categories === undefined
  }
}
