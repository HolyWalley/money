import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  beginSyncOperation,
  derivePhase,
  endSyncOperation,
  getSyncStatusSnapshot,
  registerSyncController,
  reportSyncFailed,
  reportSyncSucceeded,
  reportUnqueuedUpdates,
  requestSyncRetry,
  resetSyncAttempts,
  resetSyncStatus,
  setSyncEnabled,
  subscribeSyncStatus,
  type SyncPhase,
} from './sync-status'
import { resetNetworkStatus, type ConnectionState } from './network-status'

const base = {
  enabled: true,
  activeOperations: 0,
  lastFailure: null,
  attemptsExhausted: false,
  connection: 'online',
  pendingCount: 0,
} as const

function phase(overrides: Partial<Parameters<typeof derivePhase>[0]>): SyncPhase {
  return derivePhase({ ...base, ...overrides })
}

describe('derivePhase', () => {
  it('reports disabled when sync is off', () => {
    expect(phase({ enabled: false })).toBe('disabled')
  })

  it('reports idle when nothing is pending', () => {
    expect(phase({})).toBe('idle')
  })

  it('reports syncing while an operation is active', () => {
    expect(phase({ activeOperations: 1 })).toBe('syncing')
  })

  it('reports pending with queued changes', () => {
    expect(phase({ pendingCount: 3 })).toBe('pending')
  })

  it('reports offline when the connection is down', () => {
    expect(phase({ connection: 'offline' })).toBe('offline')
  })

  // Was pinned the other way ('unreachable' -> 'offline'). That pin was wrong: the
  // offline copy has no action and tells the user to wait for a connection they
  // already have, while 'unreachable' clears only on a successful request.
  it('does not claim the user is offline when the server is merely unreachable', () => {
    expect(phase({ connection: 'unreachable' })).not.toBe('offline')
  })

  it('reports error, not offline, when the server is unreachable and the outbox is stranded', () => {
    expect(phase({ connection: 'unreachable', attemptsExhausted: true, pendingCount: 1 })).toBe('error')
  })

  it('reports pending while unreachable with retries left, so the retry action survives', () => {
    expect(phase({ connection: 'unreachable', pendingCount: 2 })).toBe('pending')
  })

  it('reports error once attempts are exhausted with work queued', () => {
    expect(phase({ attemptsExhausted: true, pendingCount: 1 })).toBe('error')
  })

  it('reports unauthenticated after an auth failure', () => {
    expect(phase({ lastFailure: 'auth' })).toBe('unauthenticated')
  })

  it('disabled beats everything', () => {
    expect(phase({
      enabled: false,
      lastFailure: 'auth',
      activeOperations: 2,
      connection: 'offline',
      attemptsExhausted: true,
      pendingCount: 5,
    })).toBe('disabled')
  })

  it('unauthenticated beats syncing', () => {
    expect(phase({ lastFailure: 'auth', activeOperations: 1 })).toBe('unauthenticated')
  })

  it('unauthenticated beats offline', () => {
    expect(phase({ lastFailure: 'auth', connection: 'offline' })).toBe('unauthenticated')
  })

  it('syncing beats offline', () => {
    expect(phase({ activeOperations: 1, connection: 'offline' })).toBe('syncing')
  })

  it('offline beats error', () => {
    expect(phase({ connection: 'offline', attemptsExhausted: true, pendingCount: 2 })).toBe('offline')
  })

  it('error requires a pending count and otherwise degrades to idle', () => {
    expect(phase({ attemptsExhausted: true, pendingCount: 0 })).toBe('idle')
  })

  it('pending beats idle', () => {
    expect(phase({ pendingCount: 1 })).toBe('pending')
  })
})

// The green suite missed the sign-in-era deadlock because it pinned
// connection:'offline' beats error and, separately, unreachable -> offline, but never
// the combination. Every cell is enumerated here so no single-axis test can hide it.
// A local edit the outbox refused exists in no Dexie table, so pendingCount cannot
// see it. Before unqueuedCount the phase resolved to 'idle' — "All changes synced" —
// while the change was stranded in memory.
describe('derivePhase counts updates the outbox refused', () => {
  it('reports pending when the only unsynced change never reached the outbox', () => {
    expect(phase({ pendingCount: 0, unqueuedCount: 1 })).toBe('pending')
  })

  it('reports error, not idle, when a refused update has exhausted its attempts', () => {
    expect(phase({ pendingCount: 0, unqueuedCount: 1, attemptsExhausted: true })).toBe('error')
  })

  it('still reports error while unreachable, so the Try again button survives', () => {
    expect(phase({
      connection: 'unreachable',
      pendingCount: 0,
      unqueuedCount: 1,
      attemptsExhausted: true,
    })).toBe('error')
  })

  it('adds the two counts rather than replacing one with the other', () => {
    expect(phase({ pendingCount: 2, unqueuedCount: 1, attemptsExhausted: true })).toBe('error')
    expect(phase({ pendingCount: 0, unqueuedCount: 0, attemptsExhausted: true })).toBe('idle')
  })

  it('treats an absent unqueuedCount as zero', () => {
    expect(phase({ pendingCount: 0, attemptsExhausted: true })).toBe('idle')
  })
})

describe('derivePhase over connectivity x exhaustion x queue', () => {
  const cells: Array<[ConnectionState, boolean, number, SyncPhase]> = [
    // Genuine offline swallows everything: it self-clears on the DOM 'online' event
    // and the flush resumes on its own, so "they'll sync when you're back" is honest.
    ['offline', false, 0, 'offline'],
    ['offline', false, 2, 'offline'],
    ['offline', true, 0, 'offline'],
    ['offline', true, 2, 'offline'],
    // Unreachable is indistinguishable from online here on purpose: the browser
    // believes it has a link, so the user keeps every action they would have online.
    ['unreachable', false, 0, 'idle'],
    ['unreachable', false, 2, 'pending'],
    ['unreachable', true, 0, 'idle'],
    ['unreachable', true, 2, 'error'],
    ['online', false, 0, 'idle'],
    ['online', false, 2, 'pending'],
    ['online', true, 0, 'idle'],
    ['online', true, 2, 'error'],
  ]

  for (const [connection, attemptsExhausted, pendingCount, expected] of cells) {
    const queue = pendingCount > 0 ? `${pendingCount} queued` : 'nothing queued'
    const attempts = attemptsExhausted ? 'attempts exhausted' : 'attempts remaining'

    it(`${connection} with ${attempts} and ${queue} is ${expected}`, () => {
      expect(phase({ connection, attemptsExhausted, pendingCount })).toBe(expected)
    })
  }

  it('never returns the actionless offline phase while unreachable', () => {
    for (const attemptsExhausted of [false, true]) {
      for (const pendingCount of [0, 1, 5]) {
        expect(phase({ connection: 'unreachable', attemptsExhausted, pendingCount })).not.toBe('offline')
      }
    }
  })
})

describe('the sync status store', () => {
  it('publishes the unqueued update count and notifies readers', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSyncStatus(listener)

    reportUnqueuedUpdates(2)

    expect(getSyncStatusSnapshot().unqueuedCount).toBe(2)
    expect(listener).toHaveBeenCalled()

    reportUnqueuedUpdates(0)
    expect(getSyncStatusSnapshot().unqueuedCount).toBe(0)

    unsubscribe()
  })

  beforeEach(() => {
    resetSyncStatus()
    resetNetworkStatus()
    registerSyncController(null)
  })

  afterEach(() => {
    resetSyncStatus()
    registerSyncController(null)
  })

  it('endSyncOperation clamps at zero', () => {
    endSyncOperation()
    endSyncOperation()
    expect(getSyncStatusSnapshot().activeOperations).toBe(0)

    beginSyncOperation()
    expect(getSyncStatusSnapshot().activeOperations).toBe(1)
    endSyncOperation()
    expect(getSyncStatusSnapshot().activeOperations).toBe(0)
  })

  it('reportSyncSucceeded clears lastFailure and nextRetryAt', () => {
    reportSyncFailed('server', 12_345, 2, false)
    expect(getSyncStatusSnapshot()).toMatchObject({ lastFailure: 'server', nextRetryAt: 12_345, attempt: 2 })

    reportSyncSucceeded(999)
    expect(getSyncStatusSnapshot()).toMatchObject({
      lastFailure: null,
      nextRetryAt: null,
      attempt: 0,
      attemptsExhausted: false,
      lastSyncedAt: 999,
    })
  })

  it('resetSyncAttempts clears the backoff but keeps the last success', () => {
    reportSyncSucceeded(500)
    reportSyncFailed('server', 12_345, 3, true)

    resetSyncAttempts()

    expect(getSyncStatusSnapshot()).toMatchObject({
      lastFailure: null,
      nextRetryAt: null,
      attempt: 0,
      attemptsExhausted: false,
      lastSyncedAt: 500,
    })
  })

  it('listeners fire once per real change and not for a no-op write', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSyncStatus(listener)

    setSyncEnabled(true)
    expect(listener).toHaveBeenCalledTimes(1)

    setSyncEnabled(true)
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
  })

  it('keeps a stable snapshot identity across a no-op write', () => {
    setSyncEnabled(true)
    const before = getSyncStatusSnapshot()
    setSyncEnabled(true)
    expect(getSyncStatusSnapshot()).toBe(before)
  })

  it('unsubscribe detaches', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSyncStatus(listener)
    unsubscribe()

    setSyncEnabled(true)
    expect(listener).not.toHaveBeenCalled()
  })

  it('requestSyncRetry resolves when no controller is registered', async () => {
    await expect(requestSyncRetry()).resolves.toBeUndefined()
  })

  it('requestSyncRetry delegates to the registered controller', async () => {
    const syncNow = vi.fn(async () => {})
    registerSyncController({ syncNow })

    await requestSyncRetry()

    expect(syncNow).toHaveBeenCalledTimes(1)
  })
})
