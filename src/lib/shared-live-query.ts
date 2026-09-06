import { liveQuery } from 'dexie'
import { use, useSyncExternalStore } from 'react'
import { NONE, deferred, type Deferred, type None, type Settled } from './suspense'

/**
 * A Dexie live query shared by every component that reads it.
 *
 * `useLiveQuery` opens one IndexedDB subscription per call site, so a table read
 * by seven components is queried seven times on mount and re-read seven times on
 * every write to it. This keeps a single subscription per query and fans the
 * result out through `useSyncExternalStore`, which also means every reader gets
 * the same array identity and can be memoized against it.
 *
 * The rule: a component never sees data that is not ready. Reading suspends
 * (React `use()`) until the first value exists and never afterwards. Loading
 * starts on read, not on subscribe, because a suspended component never commits
 * and so never subscribes; the first-value promise is kept per store because
 * React renders a suspended component twice before it resolves. Once started,
 * the subscription is never released: stores are unkeyed, app-lifetime
 * singletons, and releasing was the source of stale-snapshot bugs.
 */

export const FIRST_VALUE_TIMEOUT_MS = 20_000

// Dexie's `liveQuery` only installs its write listener after a query succeeds,
// so a query that errors before its first value is dead and has to be re-run.
// Not at once: React pings the boundary on a rejection too, and a rejection
// discarded immediately would loop forever (retry → new promise → fail → retry).
export const RETRY_AFTER_ERROR_MS = 30_000

export interface SharedLiveQueryOptions {
  /** Resolves before the first query runs (`documentReady` for every doc-backed store). */
  after?: Promise<unknown>
  /** Names the store in error messages. */
  name?: string
}

export interface SharedLiveQuery<T> {
  /** Suspends until the first value, never afterwards. */
  (): T
  /** Returns `fallback` until the first value, without suspending. */
  useOr(fallback: T): T
  /** Begins the query without a subscriber; idempotent and safe from render. */
  start(): Settled<T>
  peek(): T | None
}

const resets = new Set<() => void>()

export function createSharedLiveQuery<T>(
  querier: () => Promise<T>,
  options: SharedLiveQueryOptions = {}
): SharedLiveQuery<T> {
  const name = options.name ?? 'shared live'
  const listeners = new Set<() => void>()
  let snapshot: T | None = NONE
  let first: Deferred<T> | null = null
  let rejectedAt = 0
  let subscription: { unsubscribe(): void } | null = null
  let watchdog: ReturnType<typeof setTimeout> | null = null

  const notify = () => {
    for (const listener of listeners) {
      listener()
    }
  }

  const clearWatchdog = () => {
    if (watchdog === null) return
    clearTimeout(watchdog)
    watchdog = null
  }

  const fail = (attempt: Deferred<T>, error: unknown) => {
    if (attempt !== first || attempt.promise.status !== 'pending') return
    console.error(`The ${name} query failed:`, error)
    clearWatchdog()
    subscription?.unsubscribe()
    subscription = null
    rejectedAt = Date.now()
    attempt.reject(error)
  }

  const open = (attempt: Deferred<T>) => {
    if (attempt !== first || attempt.promise.status !== 'pending') return
    // Armed here rather than in start(): the timeout measures the query, not
    // the wait for `after`, which during a restore is as long as the pull.
    watchdog = setTimeout(
      () => fail(attempt, new Error(`The ${name} query did not answer`)),
      FIRST_VALUE_TIMEOUT_MS
    )
    subscription = liveQuery(querier).subscribe({
      next: (value) => {
        clearWatchdog()
        // The render React retries reads the snapshot before the promise, so
        // the snapshot has to be in place first.
        snapshot = value
        attempt.resolve(value)
        notify()
      },
      error: (error) => {
        if (attempt.promise.status === 'pending') {
          fail(attempt, error)
          return
        }
        console.error(`The ${name} query failed:`, error)
      },
    })
  }

  const start = (): Settled<T> => {
    if (
      first &&
      (first.promise.status !== 'rejected' || Date.now() - rejectedAt < RETRY_AFTER_ERROR_MS)
    ) {
      return first.promise
    }

    const attempt = deferred<T>()
    first = attempt
    if (options.after) {
      options.after.then(
        () => open(attempt),
        (reason) => fail(attempt, reason)
      )
    } else {
      open(attempt)
    }
    return attempt.promise
  }

  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    start()
    return () => {
      listeners.delete(listener)
    }
  }

  const getSnapshot = () => snapshot

  function useSharedLiveQuery(): T {
    const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    // Unconditional so the hook's call index is stable across the replays of a
    // suspended render; on a fulfilled promise it returns at once.
    const value = use(start())
    return current === NONE ? value : current
  }

  function useOr(fallback: T): T {
    start()
    const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    return current === NONE ? fallback : current
  }

  resets.add(() => {
    clearWatchdog()
    subscription?.unsubscribe()
    subscription = null
    snapshot = NONE
    first = null
    rejectedAt = 0
  })

  return Object.assign(useSharedLiveQuery, {
    useOr,
    start,
    peek: (): T | None => snapshot,
  })
}

/** Vitest only: puts every store back to the state before its first read. */
export function resetSharedLiveQueries(): void {
  for (const reset of resets) {
    reset()
  }
}
