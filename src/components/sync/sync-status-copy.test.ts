import { describe, it, expect } from 'vitest'
import { describeSyncStatus } from './sync-status-copy'
import { derivePhase, type SyncPhase, type SyncStatus } from '@/lib/sync-status'
import type { ConnectionState } from '@/lib/network-status'

const NOW = 1_700_000_000_000

function makeStatus(overrides: Partial<SyncStatus> = {}): SyncStatus {
  return {
    phase: 'idle',
    pendingCount: 0,
    unqueuedCount: 0,
    lastSyncedAt: null,
    nextRetryAt: null,
    attempt: 0,
    maxAttempts: 5,
    ...overrides,
  }
}

describe('describeSyncStatus', () => {
  it('says nothing at all when sync is disabled', () => {
    const copy = describeSyncStatus(makeStatus({ phase: 'disabled' }), NOW)

    expect(copy.title).toBe('')
    expect(copy.detail).toBeNull()
    expect(copy.srLabel).toBe('')
  })

  it('reports everything synced when idle', () => {
    const copy = describeSyncStatus(makeStatus({ phase: 'idle' }), NOW)

    expect(copy.title).toBe('All changes synced')
    expect(copy.detail).toBeNull()
    expect(copy.icon).toBe('cloud')
    expect(copy.tone).toBe('muted')
  })

  it('reports the last sync time when idle and a sync has happened', () => {
    const copy = describeSyncStatus(
      makeStatus({ phase: 'idle', lastSyncedAt: NOW - 5 * 60_000 }),
      NOW,
    )

    expect(copy.detail).toBe('Last synced 5m ago')
  })

  it('reports what is being sent while syncing', () => {
    const copy = describeSyncStatus(makeStatus({ phase: 'syncing', pendingCount: 2 }), NOW)

    expect(copy.title).toBe('Syncing…')
    expect(copy.detail).toBe('Sending 2 changes')
    expect(copy.icon).toBe('refresh')
    expect(copy.tone).toBe('progress')
  })

  it('omits the detail while syncing with nothing queued', () => {
    expect(describeSyncStatus(makeStatus({ phase: 'syncing' }), NOW).detail).toBeNull()
  })

  it('reports the queue while pending', () => {
    const copy = describeSyncStatus(makeStatus({ phase: 'pending', pendingCount: 4 }), NOW)

    expect(copy.title).toBe('4 changes waiting to sync')
    expect(copy.detail).toBe('Sending shortly…')
    expect(copy.icon).toBe('cloud-upload')
  })

  it('reassures that offline changes are kept when nothing is queued', () => {
    const copy = describeSyncStatus(makeStatus({ phase: 'offline' }), NOW)

    expect(copy.title).toBe("You're offline")
    expect(copy.detail).toBe('Everything here is saved on this device.')
    expect(copy.srLabel).toBe('Offline')
    expect(copy.icon).toBe('cloud-off')
  })

  it('names the pending changes and promises they will sync when offline', () => {
    const copy = describeSyncStatus(makeStatus({ phase: 'offline', pendingCount: 3 }), NOW)

    expect(copy.title).toBe('3 changes saved on this device')
    expect(copy.detail).toBe("They'll sync when you're back online.")
    expect(copy.srLabel).toBe('Offline, 3 changes pending')
  })

  it('says the changes are safe on error', () => {
    const copy = describeSyncStatus(makeStatus({ phase: 'error', pendingCount: 3 }), NOW)

    expect(copy.title).toBe("Couldn't sync")
    expect(copy.detail).toBe('3 changes are safe on this device.')
    expect(copy.icon).toBe('cloud-alert')
    expect(copy.tone).toBe('danger')
  })

  it('blames the server rather than the data on an error with nothing queued', () => {
    const copy = describeSyncStatus(makeStatus({ phase: 'error' }), NOW)

    expect(copy.detail).toBe('We could not reach the server.')
  })

  it('explains that signing in resumes sync when unauthenticated', () => {
    const copy = describeSyncStatus(makeStatus({ phase: 'unauthenticated', pendingCount: 2 }), NOW)

    expect(copy.title).toBe('Signed out — sync paused')
    expect(copy.detail).toBe('2 changes are safe on this device. Sign in to send them.')
    expect(copy.srLabel).toBe('Signed out, sync paused')
    expect(copy.icon).toBe('log-in')
  })

  it('drops the pending sentence when unauthenticated with nothing queued', () => {
    const copy = describeSyncStatus(makeStatus({ phase: 'unauthenticated' }), NOW)

    expect(copy.detail).toBe('Sign in to resume syncing.')
  })

  it('uses the singular verb and noun for one pending change', () => {
    expect(describeSyncStatus(makeStatus({ phase: 'offline', pendingCount: 1 }), NOW).title)
      .toBe('1 change saved on this device')
    expect(describeSyncStatus(makeStatus({ phase: 'error', pendingCount: 1 }), NOW).detail)
      .toBe('1 change is safe on this device.')
  })

  it('uses the plural verb and noun for three pending changes', () => {
    expect(describeSyncStatus(makeStatus({ phase: 'offline', pendingCount: 3 }), NOW).title)
      .toBe('3 changes saved on this device')
    expect(describeSyncStatus(makeStatus({ phase: 'error', pendingCount: 3 }), NOW).detail)
      .toBe('3 changes are safe on this device.')
  })

  it('showDot is false for disabled', () => {
    expect(describeSyncStatus(makeStatus({ phase: 'disabled' }), NOW).showDot).toBe(false)
  })

  it('showDot is false for idle', () => {
    expect(describeSyncStatus(makeStatus({ phase: 'idle' }), NOW).showDot).toBe(false)
  })

  it('showDot is true for every other phase', () => {
    const phases: SyncPhase[] = ['syncing', 'pending', 'offline', 'error', 'unauthenticated']

    for (const phase of phases) {
      expect(describeSyncStatus(makeStatus({ phase, pendingCount: 1 }), NOW).showDot).toBe(true)
    }
  })

  it('renders a retry action for pending and error', () => {
    expect(describeSyncStatus(makeStatus({ phase: 'pending', pendingCount: 1 }), NOW).action)
      .toEqual({ label: 'Sync now', kind: 'retry' })
    expect(describeSyncStatus(makeStatus({ phase: 'error', pendingCount: 1 }), NOW).action)
      .toEqual({ label: 'Try again', kind: 'retry' })
  })

  it('renders a signin action for unauthenticated', () => {
    expect(describeSyncStatus(makeStatus({ phase: 'unauthenticated' }), NOW).action)
      .toEqual({ label: 'Sign in', kind: 'signin' })
  })

  it('renders no action for offline', () => {
    expect(describeSyncStatus(makeStatus({ phase: 'offline', pendingCount: 3 }), NOW).action).toBeNull()
    expect(describeSyncStatus(makeStatus({ phase: 'offline' }), NOW).action).toBeNull()
  })

  it('counts down to the next retry', () => {
    const copy = describeSyncStatus(
      makeStatus({ phase: 'pending', pendingCount: 1, nextRetryAt: NOW + 8400 }),
      NOW,
    )

    expect(copy.detail).toBe('Trying again in 9s')
  })

  it('says sending shortly when nextRetryAt is in the past', () => {
    const copy = describeSyncStatus(
      makeStatus({ phase: 'pending', pendingCount: 1, nextRetryAt: NOW - 1_000 }),
      NOW,
    )

    expect(copy.detail).toBe('Sending shortly…')
  })

  it('formats relative last-sync times across every boundary', () => {
    const detailAt = (ago: number) =>
      describeSyncStatus(makeStatus({ phase: 'idle', lastSyncedAt: NOW - ago }), NOW).detail

    expect(detailAt(59_000)).toBe('Last synced just now')
    expect(detailAt(61_000)).toBe('Last synced 1m ago')
    expect(detailAt(59 * 60_000)).toBe('Last synced 59m ago')
    expect(detailAt(61 * 60_000)).toBe('Last synced 1h ago')
    expect(detailAt(25 * 3_600_000)).toBe('Last synced 1d ago')
  })

  it('defaults now to the current clock', () => {
    const copy = describeSyncStatus(makeStatus({ phase: 'idle', lastSyncedAt: Date.now() - 1_000 }))

    expect(copy.detail).toBe('Last synced just now')
  })
})

// These drive the REAL state machine rather than a hand-written phase, because the
// deadlock this covers was a derivePhase ordering bug that every synthetic-phase copy
// test happily passed through.
describe('describeSyncStatus over phases the real state machine produces', () => {
  function phaseFor(connection: ConnectionState, attemptsExhausted: boolean, pendingCount: number) {
    return derivePhase({
      enabled: true,
      activeOperations: 0,
      lastFailure: 'network',
      attemptsExhausted,
      connection,
      pendingCount,
    })
  }

  function copyFor(connection: ConnectionState, attemptsExhausted: boolean, pendingCount: number) {
    const phase = phaseFor(connection, attemptsExhausted, pendingCount)
    return { phase, copy: describeSyncStatus(makeStatus({ phase, pendingCount }), NOW) }
  }

  it('offers Try again for a stranded outbox on an unreachable server', () => {
    const { phase, copy } = copyFor('unreachable', true, 2)

    expect(phase).toBe('error')
    expect(copy.title).toBe("Couldn't sync")
    expect(copy.detail).toBe('2 changes are safe on this device.')
    expect(copy.action).toEqual({ label: 'Try again', kind: 'retry' })
  })

  it('never tells an unreachable user they are offline or to wait', () => {
    for (const attemptsExhausted of [false, true]) {
      for (const pendingCount of [0, 3]) {
        const { copy } = copyFor('unreachable', attemptsExhausted, pendingCount)

        expect(copy.title).not.toBe("You're offline")
        expect(copy.detail).not.toBe("They'll sync when you're back online.")
      }
    }
  })

  it('never leaves queued changes actionless while the server is merely unreachable', () => {
    for (const attemptsExhausted of [false, true]) {
      const { copy } = copyFor('unreachable', attemptsExhausted, 3)

      expect(copy.action).not.toBeNull()
    }
  })

  it('keeps the wait-it-out promise for a genuinely offline browser', () => {
    const { phase, copy } = copyFor('offline', true, 2)

    expect(phase).toBe('offline')
    expect(copy.title).toBe('2 changes saved on this device')
    expect(copy.detail).toBe("They'll sync when you're back online.")
    expect(copy.action).toBeNull()
  })
})

// A change the outbox refused is unsynced but NOT durably stored. It has to be
// counted, or the copy reads "0 changes waiting to sync"; and it must never be
// described as safe on this device, because it lives only in this tab's memory.
describe('changes the outbox refused', () => {
  it('counts them so no state announces zero changes', () => {
    for (const phase of ['pending', 'error', 'offline', 'unauthenticated'] as const) {
      const copy = describeSyncStatus(
        makeStatus({ phase, pendingCount: 0, unqueuedCount: 1 }),
        NOW,
      )

      expect(copy.title).not.toMatch(/\b0 changes?\b/)
      expect(copy.detail ?? '').not.toMatch(/\b0 changes?\b/)
    }
  })

  it('never promises a stranded change is safe on this device', () => {
    for (const phase of ['error', 'offline', 'unauthenticated'] as const) {
      const copy = describeSyncStatus(
        makeStatus({ phase, pendingCount: 0, unqueuedCount: 1 }),
        NOW,
      )

      expect(copy.detail ?? '').not.toMatch(/safe on this device|saved on this device/)
      expect(copy.title).not.toMatch(/saved on this device/)
    }
  })

  it('says the device could not save the change, and keeps Try again', () => {
    const copy = describeSyncStatus(
      makeStatus({ phase: 'error', pendingCount: 0, unqueuedCount: 1 }),
      NOW,
    )

    expect(copy.title).toBe("Couldn't sync")
    expect(copy.detail).toBe('This device could not save 1 change. Keep this tab open until it syncs.')
    expect(copy.action).toEqual({ label: 'Try again', kind: 'retry' })
  })

  it('adds them to the durable count rather than replacing it', () => {
    const copy = describeSyncStatus(
      makeStatus({ phase: 'error', pendingCount: 2, unqueuedCount: 1 }),
      NOW,
    )

    expect(copy.detail).toBe('This device could not save 3 changes. Keep this tab open until they sync.')
  })

  it('leaves the ordinary durable wording untouched when nothing was refused', () => {
    const copy = describeSyncStatus(
      makeStatus({ phase: 'error', pendingCount: 2, unqueuedCount: 0 }),
      NOW,
    )

    expect(copy.detail).toBe('2 changes are safe on this device.')
  })
})
