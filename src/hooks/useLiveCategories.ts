import { useState, useEffect } from 'react'
import { useDatabase } from '@/contexts/DatabaseContext'
import type { Category } from '../../shared/schemas/category.schema'

export function useLiveCategories() {
  const { categoryService, db, isInitializing } = useDatabase()
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!categoryService || !db || isInitializing) return

    let changes: PouchDB.Core.Changes<Category> | null = null

    const loadCategories = async () => {
      try {
        const cats = await categoryService.getAllCategories()
        setCategories(cats)
        setIsLoading(false)
      } catch (error) {
        console.error('Failed to load categories:', error)
        setIsLoading(false)
      }
    }

    // Initial load
    loadCategories()

    // Listen for changes
    changes = db.categories.changes({
      since: 'now',
      live: true,
      include_docs: true
    }).on('change', () => {
      // Reload categories when any change occurs
      loadCategories()
    }).on('error', (err) => {
      console.error('Changes feed error:', err)
    })

    return () => {
      // Cleanup listener
      if (changes) {
        changes.cancel()
      }
    }
  }, [categoryService, db, isInitializing])

  return { categories, isLoading }
}
