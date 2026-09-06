export const NONE: unique symbol = Symbol('no value yet')
export type None = typeof NONE

/**
 * A promise carrying its own outcome, in the shape React's `use()` reads: a
 * fulfilled one is returned synchronously instead of suspending the reader.
 */
export interface Settled<T> extends Promise<T> {
  status: 'pending' | 'fulfilled' | 'rejected'
  value?: T
  reason?: unknown
}

export interface Deferred<T> {
  promise: Settled<T>
  resolve(value: T): void
  reject(reason: unknown): void
}

export function deferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void
  let rejectPromise!: (reason: unknown) => void
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  }) as Settled<T>
  promise.status = 'pending'

  return {
    promise,
    resolve(value) {
      if (promise.status !== 'pending') return
      promise.status = 'fulfilled'
      promise.value = value
      resolvePromise(value)
    },
    reject(reason) {
      if (promise.status !== 'pending') return
      promise.status = 'rejected'
      promise.reason = reason
      // The reader that will observe this may not have rendered yet; without a
      // handler the rejection is reported as unhandled in the meantime.
      promise.catch(() => {})
      rejectPromise(reason)
    },
  }
}

export function settled<T>(value: T): Settled<T> {
  const promise = Promise.resolve(value) as Settled<T>
  promise.status = 'fulfilled'
  promise.value = value
  return promise
}
