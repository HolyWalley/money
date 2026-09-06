import { crdtReady } from './crdts'
import { isRestorePending, subscribePendingRestore } from './pending-restore'

function waitUntilRestoreIsNotPending(): Promise<void> {
  if (!isRestorePending()) return Promise.resolve()

  return new Promise((resolve) => {
    const unsubscribe = subscribePendingRestore(() => {
      if (isRestorePending()) return
      unsubscribe()
      resolve()
    })
  })
}

// The doc must be loaded before anything reads the mirror or writes the doc:
// y-indexeddb drops updates issued before its DB opens, and an empty doc is
// indistinguishable from an empty account. During a restore the doc is empty
// until the pull lands.
export const documentReady: Promise<void> = crdtReady.then(waitUntilRestoreIsNotPending)
