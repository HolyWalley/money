import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { createDefaultCategories } from '@/lib/default-categories'
import { addCategoryWithId, crdtReady } from '@/lib/crdts'
import { isRestorePending, subscribePendingRestore } from '@/lib/pending-restore'
import { reconcileLinkedGoals } from '@/services/recurringGoalLinker'

export function useAppInitialization() {
  const { categories, isLoading } = useLiveCategories()
  const hasInitialized = useRef(false)

  // Subscribed rather than read once: the flag drops when the replacement data
  // lands, and seeding has to be reconsidered at that moment.
  const restorePending = useSyncExternalStore(
    subscribePendingRestore,
    isRestorePending,
    isRestorePending
  )

  useEffect(() => {
    if (isLoading || hasInitialized.current) return

    // An empty document is only a new account if nothing is on its way to fill
    // it. During a restore it means the old data has been thrown away and the
    // replacement has not arrived, and categories invented here would merge
    // with the ones the pull is about to deliver.
    if (restorePending) return

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
  }, [categories, isLoading, restorePending])

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
