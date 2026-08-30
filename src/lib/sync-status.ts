import type { ApiFailure } from './api-client'
import { subscribeConnection, type ConnectionState } from './network-status'

export type SyncPhase =
  | 'disabled'
  | 'idle'
  | 'syncing'
  | 'pending'
  | 'offline'
  | 'error'
  | 'unauthenticated'

export interface SyncStatus {
  phase: SyncPhase
  /** Unsynced changes the outbox holds durably. */
  pendingCount: number
  /** Unsynced changes the outbox refused, held only in memory. See the snapshot field. */
  unqueuedCount: number
  lastSyncedAt: number | null
  nextRetryAt: number | null
  attempt: number
  maxAttempts: number
}

export interface SyncStatusSnapshot {
  enabled: boolean
  activeOperations: number
  /**
   * Local edits the outbox refused to persist, so they are held only in memory. They
   * are invisible to countPendingUpdates() but they are unsynced changes all the same,
   * and without them a dead IndexedDB reads as "All changes synced".
   */
  unqueuedCount: number
  lastFailure: ApiFailure | null
  attemptsExhausted: boolean
  lastSyncedAt: number | null
  nextRetryAt: number | null
  attempt: number
}

export interface SyncController {
  syncNow(): Promise<void>
}

function initialSnapshot(): SyncStatusSnapshot {
  return {
    enabled: false,
    activeOperations: 0,
    unqueuedCount: 0,
    lastFailure: null,
    attemptsExhausted: false,
    lastSyncedAt: null,
    nextRetryAt: null,
    attempt: 0,
  }
}

let snapshot: SyncStatusSnapshot = initialSnapshot()
let controller: SyncController | null = null
const listeners = new Set<() => void>()
let unsubscribeConnection: (() => void) | null = null

function notify(): void {
  for (const listener of [...listeners]) {
    listener()
  }
}

// A new object identity is minted only on a real field change: useSyncExternalStore
// re-renders forever if getSnapshot returns a fresh object every call.
function update(patch: Partial<SyncStatusSnapshot>): void {
  let changed = false
  for (const key of Object.keys(patch) as (keyof SyncStatusSnapshot)[]) {
    if (snapshot[key] !== patch[key]) {
      changed = true
      break
    }
  }
  if (!changed) return

  snapshot = { ...snapshot, ...patch }
  notify()
}

export function derivePhase(i: {
  enabled: boolean
  activeOperations: number
  lastFailure: ApiFailure | null
  attemptsExhausted: boolean
  connection: ConnectionState
  pendingCount: number
  unqueuedCount?: number
}): SyncPhase {
  const pending = i.pendingCount + (i.unqueuedCount ?? 0)
  if (!i.enabled) return 'disabled'
  if (i.lastFailure === 'auth') return 'unauthenticated'
  if (i.activeOperations > 0) return 'syncing'
  // Only a genuine 'offline' earns the offline phase, whose copy tells the user to
  // wait and offers no action: it self-clears on the DOM 'online' event. 'unreachable'
  // clears ONLY on a successful request, so treating it as offline strands the outbox
  // behind a screen with no button. It falls through to 'error'/'pending', which both
  // carry a retry the user can actually press.
  if (i.connection === 'offline') return 'offline'
  if (i.attemptsExhausted && pending > 0) return 'error'
  if (pending > 0) return 'pending'
  return 'idle'
}

export function getSyncStatusSnapshot(): SyncStatusSnapshot {
  return snapshot
}

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener)

  // A connectivity change alters the derived phase without touching this store,
  // so readers have to be woken for it too.
  if (!unsubscribeConnection) {
    unsubscribeConnection = subscribeConnection(notify)
  }

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      unsubscribeConnection?.()
      unsubscribeConnection = null
    }
  }
}

export function setSyncEnabled(enabled: boolean): void {
  update({ enabled })
}

/** Count of local updates the outbox rejected and that are held only in memory. */
export function reportUnqueuedUpdates(count: number): void {
  update({ unqueuedCount: count })
}

export function beginSyncOperation(): void {
  update({ activeOperations: snapshot.activeOperations + 1 })
}

export function endSyncOperation(): void {
  update({ activeOperations: Math.max(0, snapshot.activeOperations - 1) })
}

export function reportSyncSucceeded(at: number): void {
  update({
    lastSyncedAt: at,
    lastFailure: null,
    nextRetryAt: null,
    attempt: 0,
    attemptsExhausted: false,
  })
}

export function reportSyncFailed(
  failure: ApiFailure,
  nextRetryAt: number | null,
  attempt: number,
  exhausted: boolean,
): void {
  update({ lastFailure: failure, nextRetryAt, attempt, attemptsExhausted: exhausted })
}

/** Clears the backoff without discarding the last successful sync time. */
export function resetSyncAttempts(): void {
  update({ lastFailure: null, nextRetryAt: null, attempt: 0, attemptsExhausted: false })
}

export function resetSyncStatus(): void {
  snapshot = initialSnapshot()
  notify()
}

export function registerSyncController(c: SyncController | null): void {
  controller = c
}

export async function requestSyncRetry(): Promise<void> {
  if (!controller) return
  await controller.syncNow()
}
