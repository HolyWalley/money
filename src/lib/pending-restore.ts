const STORAGE_KEY = 'money-pending-restore'

/**
 * 'replacing' - the dump is on its way to the server and the local data has not
 * been thrown away yet. Held in memory only: it lasts from the click until the
 * reload, so a tab closed halfway through should leave nothing behind.
 *
 * 'awaiting-data' - the local data is gone and the server's copy has not
 * arrived. This one has to survive the reload it sits either side of.
 */
export type RestorePhase = 'replacing' | 'awaiting-data'

const listeners = new Set<() => void>()

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    // Safari in private mode throws rather than returning null.
    return false
  }
}

let phase: RestorePhase | null = readStored() ? 'awaiting-data' : null

function store(persist: boolean): void {
  try {
    if (persist) {
      localStorage.setItem(STORAGE_KEY, '1')
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // In memory is still better than nothing: it covers the rest of this
    // session, which is most of the window that matters.
  }
}

function setPhase(next: RestorePhase | null): void {
  if (next === phase) return
  phase = next

  store(next === 'awaiting-data')

  for (const listener of listeners) {
    listener()
  }
}

/**
 * The data is about to be replaced.
 *
 * Two things must not happen from here until the replacement has landed.
 * Seeding default categories would read the emptied document as a brand-new
 * account and invent a second set of them, which then merges with the set the
 * pull is about to deliver. And uploading the document as initial sync state
 * would push the very data being discarded straight back to the server.
 */
export function beginRestore(): void {
  setPhase('replacing')
}

/**
 * The local data is gone; only the server's copy can end this.
 *
 * Kept apart from 'replacing' because only this phase may be ended by a pull. A
 * pull landing while the old document is still loaded would otherwise clear the
 * way for sync to upload it - the one thing the flag exists to prevent.
 */
export function awaitRestoredData(): void {
  setPhase('awaiting-data')
}

export function endRestore(): void {
  setPhase(null)
}

export function isRestorePending(): boolean {
  return phase !== null
}

export function isAwaitingRestoredData(): boolean {
  return phase === 'awaiting-data'
}

export function subscribePendingRestore(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
