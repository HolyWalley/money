import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db-dexie'
import type { Category } from '../../shared/schemas/category.schema'

export function useLiveCategories() {
  const categories = useLiveQuery(async () => {
    const dexieCategories = await db.categories.toArray()
    // Convert Date objects back to ISO strings for components
    return dexieCategories.map(cat => ({
      ...cat,
      createdAt: cat.createdAt.toISOString(),
      updatedAt: cat.updatedAt.toISOString()
    })) as Category[]
  }, [])

  return { 
    categories: categories || [], 
    isLoading: categories === undefined 
  }
}
