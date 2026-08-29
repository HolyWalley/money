import { liveQuery } from 'dexie'
import { useSyncExternalStore } from 'react'

/**
 * A Dexie live query shared by every component that reads it.
 *
 * `useLiveQuery` opens one IndexedDB subscription per call site, so a table read
 * by seven components is queried seven times on mount and re-read seven times on
 * every write to it. This keeps a single subscription per query and fans the
 * result out through `useSyncExternalStore`, which also means every reader gets
 * the same array identity and can be memoized against it.
 */
export function createSharedLiveQuery<T>(querier: () => Promise<T>) {
  let snapshot: T | undefined
  let subscription: { unsubscribe: () => void } | undefined
  const listeners = new Set<() => void>()

  const subscribe = (listener: () => void) => {
    listeners.add(listener)

    if (!subscription) {
      subscription = liveQuery(querier).subscribe({
        next: (value) => {
          snapshot = value
          for (const notify of listeners) {
            notify()
          }
        },
        error: (error) => {
          console.error('Shared live query failed:', error)
        },
      })
    }

    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) {
        subscription?.unsubscribe()
        subscription = undefined
      }
    }
  }

  // The last snapshot is kept across an unsubscribe so a remount renders the
  // previous data instead of flashing a loading state; Dexie emits again on
  // resubscribe, which refreshes it.
  const getSnapshot = () => snapshot

  return () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Same, keyed by a parameter, so each distinct argument gets its own shared
 * subscription instead of one per call site.
 */
export function createKeyedSharedLiveQuery<K extends string, T>(
  querier: (key: K) => Promise<T>
) {
  const byKey = new Map<K, () => T | undefined>()

  return (key: K) => {
    let useShared = byKey.get(key)
    if (!useShared) {
      useShared = createSharedLiveQuery(() => querier(key))
      byKey.set(key, useShared)
    }
    return useShared()
  }
}
