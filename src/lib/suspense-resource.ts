import { use, useDeferredValue, useSyncExternalStore } from 'react'
import { getConnectionState, subscribeConnection } from './network-status'
import { NONE, deferred, settled, type Deferred, type None, type Settled } from './suspense'

/**
 * A keyed, stale-while-revalidate read for market data (exchange rates,
 * instrument prices): the cache answers first, the network refreshes behind it.
 *
 * Reading suspends only when the cache cannot answer; once an entry has its
 * first value it never suspends again while it exists, and later answers
 * replace the value in place. As with the live stores, loading starts on read
 * because a suspended component never commits and so never subscribes, and
 * the first-value promise is kept per entry because React renders a suspended
 * component twice before it resolves.
 */

export interface CacheAnswer<T> {
  value: T
  /** Complete enough to render. */
  answers: boolean
  /** Worth refreshing in the background. */
  stale: boolean
}

export interface LoadAnswer<T> {
  value: T
  /** False when the network did not fully answer (offline, provider failure): retry sooner. */
  complete: boolean
}

export interface ResourceSource<T> {
  /** IndexedDB only; may reject only on an IndexedDB failure. */
  fromCache(key: string): Promise<CacheAnswer<T>>
  /**
   * Network + cache write. Must not reject for a network or provider failure:
   * resolve with what the cache has and `complete: false`.
   */
  load(key: string): Promise<LoadAnswer<T>>
  /**
   * A refresh never shrinks an answer (union, next wins). Return `previous`
   * when nothing changed so readers keep their identity.
   */
  merge(previous: T, next: T): T
  revalidateAfterMs: number
}

export const RETRY_AFTER_FAILURE_MS = 30_000
export const IDLE_ENTRIES_RETAINED = 16

export interface ResourceEntry<T> {
  subscribe(listener: () => void): () => void
  getValue(): T | None
  /** Suspends until the first value, never afterwards. */
  first(): Settled<T>
}

export interface Resource<T> {
  entry(key: string): ResourceEntry<T>
  /** Begins the read without a subscriber; idempotent. */
  preload(key: string): Settled<T>
  /** Refreshes when the entry is due and nothing is in flight; safe from render. */
  revalidate(key: string): void
  resetForTests(): void
}

interface Entry<T> extends ResourceEntry<T> {
  readonly key: string
  value: T | None
  attempt: Deferred<T> | null
  refreshing: Promise<void> | null
  revalidateAt: number
  failedAt: number
  lastReadAt: number
  readonly listeners: Set<() => void>
}

interface Registered {
  reset(): void
  markStale(): void
}

const registry = new Set<Registered>()

export function createResource<T>(source: ResourceSource<T>): Resource<T> {
  const entries = new Map<string, Entry<T>>()

  const notify = (entry: Entry<T>) => {
    for (const listener of entry.listeners) {
      listener()
    }
  }

  const settle = (entry: Entry<T>, next: T, complete: boolean) => {
    const previous = entry.value
    // The render React retries reads the value before the promise, so the
    // value has to be in place first.
    entry.value = previous === NONE ? next : source.merge(previous, next)
    entry.revalidateAt = Date.now() + (complete ? source.revalidateAfterMs : RETRY_AFTER_FAILURE_MS)
    entry.attempt?.resolve(entry.value)
    notify(entry)
  }

  const fail = (entry: Entry<T>, attempt: Deferred<T>, error: unknown) => {
    if (attempt !== entry.attempt || attempt.promise.status !== 'pending') return
    console.error(`Reading "${entry.key}" failed:`, error)
    entry.failedAt = Date.now()
    attempt.reject(error)
  }

  const refresh = (entry: Entry<T>): Promise<void> => {
    if (entry.refreshing) return entry.refreshing
    const inFlight = source
      .load(entry.key)
      .then(
        (loaded) => {
          settle(entry, loaded.value, loaded.complete)
        },
        (error: unknown) => {
          // Only IndexedDB rejects here; the value on screen stays.
          console.error(`Refreshing "${entry.key}" failed:`, error)
          entry.revalidateAt = Date.now() + RETRY_AFTER_FAILURE_MS
        }
      )
      .finally(() => {
        if (entry.refreshing === inFlight) entry.refreshing = null
      })
    entry.refreshing = inFlight
    return inFlight
  }

  const resolveFirst = async (entry: Entry<T>, attempt: Deferred<T>) => {
    let cached: CacheAnswer<T>
    try {
      cached = await source.fromCache(entry.key)
    } catch (error) {
      fail(entry, attempt, error)
      return
    }
    if (attempt !== entry.attempt) return

    if (cached.answers) {
      settle(entry, cached.value, !cached.stale)
      if (cached.stale) void refresh(entry)
      return
    }

    let loaded: LoadAnswer<T>
    try {
      loaded = await source.load(entry.key)
    } catch (error) {
      fail(entry, attempt, error)
      return
    }
    if (attempt !== entry.attempt) return
    settle(entry, loaded.value, loaded.complete)
  }

  const first = (entry: Entry<T>): Settled<T> => {
    const attempt = entry.attempt
    // A rejection is kept for a while: React pings the boundary on a rejection
    // too, and one discarded at once would loop (retry → new promise → fail).
    if (
      attempt &&
      (attempt.promise.status !== 'rejected' || Date.now() - entry.failedAt < RETRY_AFTER_FAILURE_MS)
    ) {
      return attempt.promise
    }
    const next = deferred<T>()
    entry.attempt = next
    void resolveFirst(entry, next)
    return next.promise
  }

  const isIdle = (entry: Entry<T>) =>
    entry.listeners.size === 0 &&
    entry.refreshing === null &&
    entry.attempt !== null &&
    entry.attempt.promise.status !== 'pending'

  const evictIdle = () => {
    const idle = [...entries.values()].filter(isIdle)
    if (idle.length <= IDLE_ENTRIES_RETAINED) return
    idle.sort((a, b) => a.lastReadAt - b.lastReadAt)
    for (const entry of idle.slice(0, idle.length - IDLE_ENTRIES_RETAINED)) {
      entries.delete(entry.key)
    }
  }

  const createEntry = (key: string): Entry<T> => {
    const entry: Entry<T> = {
      key,
      value: NONE,
      attempt: null,
      refreshing: null,
      revalidateAt: 0,
      failedAt: 0,
      lastReadAt: Date.now(),
      listeners: new Set(),
      subscribe(listener) {
        entry.listeners.add(listener)
        first(entry)
        return () => {
          entry.listeners.delete(listener)
        }
      },
      getValue: () => entry.value,
      first: () => first(entry),
    }
    return entry
  }

  const entry = (key: string): Entry<T> => {
    let existing = entries.get(key)
    if (!existing) {
      existing = createEntry(key)
      entries.set(key, existing)
      evictIdle()
    }
    existing.lastReadAt = Date.now()
    return existing
  }

  const revalidate = (key: string) => {
    const existing = entries.get(key)
    if (!existing || existing.value === NONE || existing.refreshing) return
    if (Date.now() < existing.revalidateAt) return
    void refresh(existing)
  }

  const resource: Resource<T> = {
    entry,
    preload: (key) => entry(key).first(),
    revalidate,
    resetForTests: () => {
      entries.clear()
    },
  }

  registry.add({
    reset: resource.resetForTests,
    markStale: () => {
      for (const existing of entries.values()) {
        existing.revalidateAt = 0
      }
    },
  })

  return resource
}

// An answer given offline must not sit for an hour: once the link is back,
// every entry is due on its next render.
let connection = getConnectionState()
subscribeConnection(() => {
  const previous = connection
  connection = getConnectionState()
  if (connection !== 'online' || previous === 'online') return
  for (const resource of registry) {
    resource.markStale()
  }
})

const SETTLED_NULL = settled(null)
const NO_ENTRY: ResourceEntry<null> = {
  subscribe: () => () => {},
  getValue: () => NONE,
  first: () => SETTLED_NULL,
}

/**
 * Reads the entry for `key`; `null` for a null key. The key is deferred: one
 * that follows live data (rows on screen, symbols held) changes on a Dexie
 * write, which is a sync render, and deferred the old key's value stays up
 * while the new key answers in a transition-lane render. Inside a transition
 * the new key passes straight through, so user-driven changes pay no extra render.
 */
export function useResource<T>(resource: Resource<T>, key: string | null): T | null {
  const deferredKey = useDeferredValue(key)
  const entry = deferredKey === null ? NO_ENTRY : resource.entry(deferredKey)
  const value = useSyncExternalStore<T | null | None>(entry.subscribe, entry.getValue, entry.getValue)
  // Unconditional so the hook's call index is stable across the replays of a
  // suspended render; on a fulfilled promise it returns at once.
  const first = use(deferredKey === null ? SETTLED_NULL : entry.first())
  if (deferredKey === null) return null
  resource.revalidate(deferredKey)
  return value === NONE ? first : value
}

/** Vitest only: forgets every entry of every resource. */
export function resetResources(): void {
  for (const resource of registry) {
    resource.reset()
  }
}
