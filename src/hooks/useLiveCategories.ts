import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db-dexie'

export function useLiveCategories() {
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])

  return { categories, isLoading: false }
}
