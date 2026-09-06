import { useMemo } from 'react'
import { db } from '@/lib/db-dexie'
import { documentReady } from '@/lib/document-ready'
import { createSharedLiveQuery } from '@/lib/shared-live-query'
import type { Category } from '../../shared/schemas/category.schema'

// TODO: create a transaction type enum-type

export const categoriesStore = createSharedLiveQuery(async () => {
  const dexieCategories = await db.categories.orderBy('order').toArray()
  // Convert Date objects back to ISO strings for components
  return dexieCategories.map(cat => ({
    ...cat,
    createdAt: cat.createdAt.toISOString(),
    updatedAt: cat.updatedAt.toISOString()
  })) as Category[]
}, { after: documentReady, name: 'categories' })

export function useLiveCategories(type?: 'expense' | 'income' | 'transfer'): Category[] {
  const categories = categoriesStore()

  return useMemo(
    () => (type ? categories.filter(category => category.type === type) : categories),
    [categories, type]
  )
}
