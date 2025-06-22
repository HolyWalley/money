import { useEffect, useRef } from 'react'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { createDefaultCategories } from '@/lib/default-categories'
import { addCategoryWithId } from '@/lib/crdts'

export function useAppInitialization() {
  const { categories, isLoading } = useLiveCategories()
  const hasInitialized = useRef(false)

  useEffect(() => {
    if (isLoading || hasInitialized.current) return

    const initializeUserData = async () => {
      try {
        if (categories.length === 0) {
          const defaultCategories = createDefaultCategories()

          for (const categoryData of defaultCategories) {
            addCategoryWithId(categoryData)
          }

          console.log('Default categories created')
        }

        hasInitialized.current = true
      } catch (error) {
        console.error('Failed to initialize user data:', error)
      }
    }

    initializeUserData()
  }, [categories, isLoading])
}
