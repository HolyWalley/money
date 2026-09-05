import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  beginRestore,
  awaitRestoredData,
  endRestore,
  isRestorePending,
  isAwaitingRestoredData,
  subscribePendingRestore,
} from './pending-restore'

describe('pending-restore', () => {
  beforeEach(() => {
    endRestore()
    localStorage.clear()
  })

  it('is down until something raises it', () => {
    expect(isRestorePending()).toBe(false)
    expect(isAwaitingRestoredData()).toBe(false)
  })

  it('is up while the replacement is on its way to the server', () => {
    beginRestore()

    expect(isRestorePending()).toBe(true)
  })

  // Only the phase after the wipe may be ended by a pull. A pull landing while
  // the old document is still loaded settles nothing, and treating it as the
  // all-clear would let sync upload the document being discarded.
  it('is not waiting on the server until the local data is actually gone', () => {
    beginRestore()

    expect(isAwaitingRestoredData()).toBe(false)
  })

  it('is waiting on the server once the local data is gone', () => {
    beginRestore()
    awaitRestoredData()

    expect(isAwaitingRestoredData()).toBe(true)
  })

  // It lasts from the click to the reload, so a tab closed halfway through
  // should leave nothing to trip over next time.
  it('leaves no trace of the phase that never outlives its page', () => {
    beginRestore()

    expect(localStorage.getItem('money-pending-restore')).toBeNull()
  })

  it('goes up and comes back down', () => {
    awaitRestoredData()
    expect(isRestorePending()).toBe(true)

    endRestore()
    expect(isRestorePending()).toBe(false)
  })

  // The gap it covers spans a reload, so it cannot live in memory alone.
  it('is written somewhere that survives a reload', () => {
    awaitRestoredData()

    expect(localStorage.getItem('money-pending-restore')).toBe('1')
  })

  it('leaves nothing behind once it comes down', () => {
    awaitRestoredData()
    endRestore()

    expect(localStorage.getItem('money-pending-restore')).toBeNull()
  })

  it('tells subscribers when it changes', () => {
    const listener = vi.fn()
    subscribePendingRestore(listener)

    awaitRestoredData()
    expect(listener).toHaveBeenCalledTimes(1)

    endRestore()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  // Every successful pull lowers it, and most pulls find it already down.
  it('says nothing when nothing changed', () => {
    const listener = vi.fn()
    subscribePendingRestore(listener)

    endRestore()
    awaitRestoredData()
    awaitRestoredData()

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stops telling a subscriber that has gone away', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePendingRestore(listener)

    unsubscribe()
    awaitRestoredData()

    expect(listener).not.toHaveBeenCalled()
  })

  // Safari in private mode throws on write. Holding the flag in memory still
  // covers the rest of the session, which is most of the window that matters.
  it('still raises the flag when storage refuses to take it', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    expect(() => awaitRestoredData()).not.toThrow()
    expect(isRestorePending()).toBe(true)

    setItem.mockRestore()
  })
})
