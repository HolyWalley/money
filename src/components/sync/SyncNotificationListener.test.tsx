import { act, cleanup, render } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SyncNotificationListener } from './SyncNotificationListener'
import type { SyncPhase, SyncStatus } from '@/lib/sync-status'

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  requestSyncRetry: vi.fn(),
  pushSync: vi.fn(),
  pullSync: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: mocks.toast }))

// Only requestSyncRetry is stubbed: the integration block below drives the real
// store, so derivePhase and the operation counters have to be the real ones.
vi.mock('@/lib/sync-status', async () => {
  const actual = await vi.importActual<typeof import('@/lib/sync-status')>('@/lib/sync-status')
  return { ...actual, requestSyncRetry: mocks.requestSyncRetry }
})

vi.mock('@/lib/crdts', async () => {
  const Yjs = await vi.importActual<typeof import('yjs')>('yjs')
  return { ydoc: new Yjs.Doc() }
})

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
  return {
    ...actual,
    apiClient: {
      pushSync: mocks.pushSync,
      pullSync: mocks.pullSync,
    } as unknown as typeof actual.apiClient,
  }
})

import { ydoc } from '@/lib/crdts'
import { Sync } from '@/lib/sync'
import { updatesDb } from '@/lib/updates-db'
import { resetSyncStatus, setSyncEnabled } from '@/lib/sync-status'
import { resetNetworkStatus } from '@/lib/network-status'
import { useSyncStatus } from '@/hooks/useSyncStatus'

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

function renderListener(initial: Partial<SyncStatus> = {}) {
  const { rerender } = render(<SyncNotificationListener status={makeStatus(initial)} />)
  return (next: Partial<SyncStatus>) =>
    rerender(<SyncNotificationListener status={makeStatus(next)} />)
}

beforeEach(() => {
  mocks.toast.mockClear()
  mocks.requestSyncRetry.mockClear()
})

describe('SyncNotificationListener', () => {
  it('fires no toast on the first render, whatever the phase', () => {
    const phases: SyncPhase[] = [
      'disabled', 'idle', 'syncing', 'pending', 'offline', 'error', 'unauthenticated',
    ]

    for (const phase of phases) {
      render(<SyncNotificationListener status={makeStatus({ phase, pendingCount: 3 })} />)
    }

    expect(mocks.toast).not.toHaveBeenCalled()
  })

  it('fires one offline toast on idle -> offline with pending changes', () => {
    const update = renderListener({ phase: 'idle' })

    update({ phase: 'offline', pendingCount: 3 })

    expect(mocks.toast).toHaveBeenCalledTimes(1)
    expect(mocks.toast).toHaveBeenCalledWith("You're offline", expect.objectContaining({
      description: '3 changes are saved on this device.',
      id: 'sync-offline',
    }))
  })

  it('fires nothing on a second render still in offline', () => {
    const update = renderListener({ phase: 'idle' })

    update({ phase: 'offline', pendingCount: 3 })
    mocks.toast.mockClear()
    update({ phase: 'offline', pendingCount: 3 })

    expect(mocks.toast).not.toHaveBeenCalled()
  })

  it('fires no offline toast when nothing is pending', () => {
    const update = renderListener({ phase: 'idle' })

    update({ phase: 'offline', pendingCount: 0 })

    expect(mocks.toast).not.toHaveBeenCalled()
  })

  it('fires a Back online toast on offline -> syncing with pending changes', () => {
    const update = renderListener({ phase: 'offline', pendingCount: 2 })

    update({ phase: 'syncing', pendingCount: 2 })

    expect(mocks.toast).toHaveBeenCalledTimes(1)
    expect(mocks.toast).toHaveBeenCalledWith('Back online', expect.objectContaining({
      description: 'Syncing 2 changes…',
      id: 'sync-online',
    }))
  })

  it('fires an error toast carrying a Try again action', () => {
    const update = renderListener({ phase: 'pending', pendingCount: 1 })

    update({ phase: 'error', pendingCount: 1 })

    expect(mocks.toast).toHaveBeenCalledWith("Couldn't sync", expect.objectContaining({
      description: '1 change is safe on this device.',
      duration: 10000,
    }))

    const options = mocks.toast.mock.calls[0][1] as { action: { label: string; onClick: () => void } }
    expect(options.action.label).toBe('Try again')
    options.action.onClick()
    expect(mocks.requestSyncRetry).toHaveBeenCalledTimes(1)
  })

  it('fires the unauthenticated toast with duration Infinity', () => {
    const update = renderListener({ phase: 'idle' })

    update({ phase: 'unauthenticated', pendingCount: 2 })

    expect(mocks.toast).toHaveBeenCalledWith('Signed out — sync paused', {
      description: 'Sign in to send your pending changes.',
      duration: Infinity,
      id: 'sync-auth',
    })
  })

  it('fires the unauthenticated toast only once across re-renders', () => {
    const update = renderListener({ phase: 'idle' })

    update({ phase: 'unauthenticated', pendingCount: 2 })
    update({ phase: 'unauthenticated', pendingCount: 2 })
    update({ phase: 'unauthenticated', pendingCount: 3 })

    expect(mocks.toast).toHaveBeenCalledTimes(1)
  })
})

const OK_PUSH = { ok: true, status: 200, data: { message: 'ok' } }
const OK_PULL = { ok: true, status: 200, data: { updates: [] } }

const renders: string[] = []

function Harness() {
  const status = useSyncStatus()
  renders.push(`${status.phase}:${status.pendingCount}`)
  return <SyncNotificationListener status={status} />
}

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })
}

async function settle(turns = 25): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await act(async () => { await new Promise(resolve => { setTimeout(resolve, 0) }) })
  }
}

/** The phase of the last render that still had changes waiting to be sent. */
function phaseAtTheLastPendingRender(): string {
  for (let i = renders.length - 1; i >= 0; i--) {
    const [phase, count] = renders[i].split(':')
    if (count !== '0') return phase
  }
  return 'nothing was ever pending'
}

// The confirmation toast is the one place the listener cannot be driven by props:
// the transition it has to recognise is produced by the interleaving of the Dexie
// live query with beginSyncOperation/endSyncOperation, and asserting a hand-written
// phase pair proves nothing about whether that interleaving can ever produce it.
describe('SyncNotificationListener against the real sync state machine', () => {
  let sync: Sync | null = null

  beforeEach(async () => {
    await updatesDb.open()
    await updatesDb.updates.clear()
    await updatesDb.syncMetadata.clear()

    mocks.pushSync.mockReset().mockResolvedValue(OK_PUSH)
    mocks.pullSync.mockReset().mockResolvedValue(OK_PULL)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    renders.length = 0
    resetSyncStatus()
    resetNetworkStatus()
    setOnline(true)
    setSyncEnabled(true)
  })

  afterEach(async () => {
    cleanup()
    sync?.destroy()
    sync = null
    await settle(5)
    setOnline(true)
    resetSyncStatus()
    vi.restoreAllMocks()
  })

  it('confirms an offline backlog once the real push marks the rows synced', async () => {
    setOnline(false)
    resetNetworkStatus()
    render(<Harness />)
    await act(async () => { sync = new Sync('dev-offline') })
    await settle()

    await act(async () => { ydoc.getMap('t').set('offline-edit', 1) })
    await settle()

    expect(renders).toContain('offline:1')
    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.stringContaining('Synced'), expect.anything(),
    )

    setOnline(true)
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await settle()

    expect(await updatesDb.updates.where('synced').equals(0).count()).toBe(0)
    // The whole point of the fix: the outbox empties inside the syncing window, so
    // the previous phase at that render is never one the user was warned about.
    expect(phaseAtTheLastPendingRender()).toBe('syncing')
    expect(mocks.toast).toHaveBeenCalledWith('Synced 1 change', { duration: 3000 })
  })

  it('stays silent for an ordinary online edit that never stalls', async () => {
    render(<Harness />)
    await act(async () => { sync = new Sync('dev-quiet') })
    await settle()

    await act(async () => { ydoc.getMap('t').set('ordinary-edit', 2) })
    await settle()

    // Every edit waits out the push debounce in 'pending', which is why 'pending'
    // must not earn a confirmation: this would toast on every transaction.
    expect(renders).toContain('pending:1')

    await act(async () => { await sync!.flush() })
    await settle()

    expect(await updatesDb.updates.where('synced').equals(0).count()).toBe(0)
    expect(mocks.toast).not.toHaveBeenCalled()
  })

  it('confirms a stranded backlog after a failed push finally lands', async () => {
    render(<Harness />)
    await act(async () => { sync = new Sync('dev-error') })
    await settle()

    mocks.pushSync.mockResolvedValueOnce({
      ok: false, status: 400, failure: 'client', error: 'nope',
    })

    await act(async () => { ydoc.getMap('t').set('doomed-edit', 3) })
    await settle()
    await act(async () => { await sync!.flush() })
    await settle()

    expect(renders).toContain('error:1')
    expect(mocks.toast).toHaveBeenCalledWith("Couldn't sync", expect.anything())
    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.stringContaining('Synced'), expect.anything(),
    )

    await act(async () => { await sync!.flush() })
    await settle()

    expect(await updatesDb.updates.where('synced').equals(0).count()).toBe(0)
    expect(mocks.toast).toHaveBeenCalledWith('Synced 1 change', { duration: 3000 })
  })

  it('counts the whole backlog, not just the batch that emptied the outbox', async () => {
    setOnline(false)
    resetNetworkStatus()
    render(<Harness />)
    await act(async () => { sync = new Sync('dev-batched') })
    await settle()

    // Two rows too large to share one push batch, so the outbox drains in two.
    await updatesDb.updates.bulkAdd([0, 1].map(i => ({
      update: new Uint8Array(600_000).fill(i + 1),
      timestamp: 1_000 + i,
      synced: 0 as const,
      deviceId: 'dev-batched',
    })))
    await settle()

    expect(renders).toContain('offline:2')

    let releaseSecondPush: () => void = () => {}
    mocks.pushSync
      .mockReset()
      .mockResolvedValueOnce(OK_PUSH)
      .mockImplementationOnce(async () => {
        await new Promise<void>(resolve => { releaseSecondPush = resolve })
        return OK_PUSH
      })
      .mockResolvedValue(OK_PUSH)

    setOnline(true)
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await settle()

    expect(mocks.pushSync).toHaveBeenCalledTimes(2)
    expect(renders).toContain('syncing:1')

    await act(async () => { releaseSecondPush() })
    await settle()

    expect(await updatesDb.updates.where('synced').equals(0).count()).toBe(0)
    expect(mocks.toast).toHaveBeenCalledWith('Synced 2 changes', { duration: 3000 })
  })
})
