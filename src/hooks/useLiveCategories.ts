import { useLiveQuery } from 'dexie-react-hooks'
import { db, type DexieCategory } from '@/lib/db-dexie'
import type { Category } from '../../shared/schemas/category.schema'

// TODO: create a transaction type enum-type

export function useLiveCategories(type?: 'expense' | 'income' | 'transfer') {
  const categories = useLiveQuery(async () => {
    let dexieCategories: DexieCategory[]
    if (type) {
      dexieCategories = await db.categories.where('type').equals(type).sortBy('order')
    } else {
      dexieCategories = await db.categories.orderBy('order').toArray()
    }
    // Convert Date objects back to ISO strings for components
    return dexieCategories.map(cat => ({
      ...cat,
      createdAt: cat.createdAt.toISOString(),
      updatedAt: cat.updatedAt.toISOString()
    })) as Category[]
  }, [type])

  return {
    categories: categories || [],
    isLoading: categories === undefined
  }
}
