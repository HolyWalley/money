import { useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { createDefaultCategories } from '@/lib/default-categories'
import { addCategoryWithId } from '@/lib/crdts'

export function useAppInitialization() {
  const { user, isAuthenticated } = useAuth()
  const { categories, isLoading } = useLiveCategories()
  const hasInitialized = useRef(false)

  useEffect(() => {
    if (!isAuthenticated || !user || isLoading || hasInitialized.current) return

    const initializeUserData = async () => {
      try {
        if (categories.length === 0) {
          const defaultCategories = createDefaultCategories(user.userId)

          for (const categoryData of defaultCategories) {
            addCategoryWithId(categoryData)
          }

          console.log('Default categories created for user:', user.userId)
        }

        hasInitialized.current = true
      } catch (error) {
        console.error('Failed to initialize user data:', error)
      }
    }

    initializeUserData()
  }, [isAuthenticated, user, categories, isLoading])
}
