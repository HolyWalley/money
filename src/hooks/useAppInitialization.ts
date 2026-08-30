import { useEffect, useRef } from 'react'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { createDefaultCategories } from '@/lib/default-categories'
import { addCategoryWithId, crdtReady } from '@/lib/crdts'
import { reconcileLinkedGoals } from '@/services/recurringGoalLinker'

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

  const hasReconciled = useRef(false)

  useEffect(() => {
    if (hasReconciled.current) return
    hasReconciled.current = true

    // Awaiting crdtReady is load-bearing, not defensive: before it resolves the
    // document is empty, so every linked goal would look orphaned and be
    // detached.
    crdtReady
      .then(reconcileLinkedGoals)
      .catch(error => console.error('Failed to reconcile linked goals:', error))
  }, [])
}
