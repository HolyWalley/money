import { useEffect } from 'react'
import { createDefaultCategories } from '@/lib/default-categories'
import { addCategoryWithId, categories } from '@/lib/crdts'
import { documentReady } from '@/lib/document-ready'
import { isRestorePending, subscribePendingRestore } from '@/lib/pending-restore'
import { reconcileLinkedGoals } from '@/services/recurringGoalLinker'
import { warmStores } from './warmStores'

// Reads the document itself rather than a hook: this runs above the page
// boundary, where nothing may suspend.
function seedDefaultCategories() {
  if (categories.size > 0) return

  for (const categoryData of createDefaultCategories()) {
    addCategoryWithId(categoryData)
  }

  console.log('Default categories created')
}

export function useAppInitialization() {
  useEffect(() => {
    let active = true
    let unsubscribe = () => {}

    // An empty document is only a new account if nothing is on its way to fill
    // it. During a restore it means the old data has been thrown away and the
    // replacement has not arrived, and categories invented here would merge
    // with the ones the pull is about to deliver. documentReady already waits
    // out a restore, but one can begin after it, so the flag is re-read here
    // and watched until it drops.
    documentReady
      .then(() => {
        if (!active) return

        if (!isRestorePending()) {
          seedDefaultCategories()
          return
        }

        unsubscribe = subscribePendingRestore(() => {
          if (isRestorePending()) return
          unsubscribe()
          seedDefaultCategories()
        })
      })
      .catch(error => console.error('Failed to initialize user data:', error))

    // Awaiting documentReady is load-bearing, not defensive: before it resolves
    // the document is empty, so every linked goal would look orphaned and be
    // detached.
    documentReady
      .then(() => {
        if (active) return reconcileLinkedGoals()
      })
      .catch(error => console.error('Failed to reconcile linked goals:', error))

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    void warmStores()
  }, [])
}
