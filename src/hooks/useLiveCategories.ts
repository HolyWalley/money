import { useLiveQuery } from 'dexie-react-hooks'
import { db, type DexieCategory } from '@/lib/db-dexie'
import type { Category } from '../../shared/schemas/category.schema'
import type { Collection, EntityTable, InsertType } from 'dexie'

// TODO: create a transaction type enum-type

export function useLiveCategories(type?: 'expense' | 'income' | 'transfer') {
  const categories = useLiveQuery(async () => {
    let query: EntityTable<DexieCategory, '_id'> | Collection<DexieCategory, string, InsertType<DexieCategory, "_id">> = db.categories
    if (type) {
      query = db.categories.where('type').equals(type)
    }
    const dexieCategories = await query.toArray()
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
