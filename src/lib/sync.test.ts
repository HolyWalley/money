import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

const { pushSync, pullSync } = vi.hoisted(() => ({ pushSync: vi.fn(), pullSync: vi.fn() }))

vi.mock('./crdts', async () => {
  const Yjs = await vi.importActual<typeof import('yjs')>('yjs')
  return { ydoc: new Yjs.Doc() }
})

vi.mock('./api-client', async () => {
  const actual = await vi.importActual<typeof import('./api-client')>('./api-client')
  return {
    ...actual,
    apiClient: { pushSync, pullSync } as unknown as typeof actual.apiClient,
  }
})

import { ydoc } from './crdts'
import { API_TIMEOUTS } from './api-client'
import { Sync } from './sync'
import { SYNC_META_KEYS, updatesDb } from './updates-db'
import { derivePhase, getSyncStatusSnapshot, resetSyncStatus, setSyncEnabled } from './sync-status'
import { getConnectionState, reportRequestOutcome, resetNetworkStatus } from './network-status'

const OK_PUSH = { ok: true, status: 200, data: { message: 'ok' } }

function okPull(data: Record<string, unknown> = { updates: [] }) {
  return { ok: true, status: 200, data }
}

function failed(failure: string, status: number, extra: Record<string, unknown> = {}) {
  return { ok: false, status, failure, error: 'nope', ...extra }
}

function tick(): Promise<void> {
  return new Promise(resolve => { setImmediate(resolve) })
}

async function settle(turns = 25): Promise<void> {
  for (let i = 0; i < turns; i++) await tick()
}

async function until(predicate: () => boolean, turns = 20_000): Promise<void> {
  for (let i = 0; i < turns; i++) {
    if (predicate()) return
    await tick()
  }
  throw new Error('condition was never met')
}

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })
}

function toBase64(data: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < data.length; i += 8192) binary += String.fromCharCode(...data.subarray(i, i + 8192))
  return btoa(binary)
}

function encodedUpdate(key: string, value: unknown): string {
  const source = new Y.Doc()
  source.getMap('t').set(key, value)
  return toBase64(Y.encodeStateAsUpdate(source))
}

async function seedRows(count: number, bytes = 4): Promise<void> {
  await updatesDb.updates.bulkAdd(Array.from({ length: count }, (_, i) => ({
    update: new Uint8Array(bytes).fill(i % 256),
    timestamp: 1_000 + i,
    synced: 0 as const,
    deviceId: 'dev-1',
  })))
}

async function pendingCount(): Promise<number> {
  return updatesDb.updates.where('synced').equals(0).count()
}

describe('Sync', () => {
  let sync: Sync | null = null

  function newSync(): Sync {
    sync = new Sync('dev-1', { random: () => 0.5 })
    return sync
  }

  beforeEach(async () => {
    await updatesDb.open()
    await updatesDb.updates.clear()
    await updatesDb.syncMetadata.clear()

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    pushSync.mockReset().mockResolvedValue(OK_PUSH)
    pullSync.mockReset().mockResolvedValue(okPull())

    resetSyncStatus()
    resetNetworkStatus()
    setOnline(true)
  })

  afterEach(async () => {
    sync?.destroy()
    sync = null
    await settle()
    vi.useRealTimers()
    vi.restoreAllMocks()
    setOnline(true)
    Reflect.deleteProperty(navigator, 'locks')
  })

  describe('the local update listener', () => {
    it('queues exactly one outbox row for a local Y.Doc transaction, with synced 0', async () => {
      newSync()
      await settle()

      ydoc.getMap('t').set('local', 1)
      await settle()

      const rows = await updatesDb.updates.toArray()
      expect(rows).toHaveLength(1)
      expect(rows[0].synced).toBe(0)
      expect(rows[0].deviceId).toBe('dev-1')
    })

    it("queues nothing for an update whose origin is 'sync'", async () => {
      newSync()
      await settle()

      ydoc.transact(() => { ydoc.getMap('t').set('remote', 1) }, 'sync')
      await settle()

      expect(await updatesDb.updates.count()).toBe(0)
    })

    it('does not throw and reports a failure when the outbox write rejects', async () => {
      newSync()
      await settle()

      vi.spyOn(updatesDb.updates, 'add').mockRejectedValueOnce(new Error('quota exceeded'))

      ydoc.getMap('t').set('rejected', 1)
      await settle()

      expect(getSyncStatusSnapshot()).toMatchObject({ lastFailure: 'client', attemptsExhausted: true })
      expect(pushSync).not.toHaveBeenCalled()
    })
  })

  describe('an update the outbox refused', () => {
    it('is pushed from memory instead of being dropped', async () => {
      newSync()
      await settle()

      vi.spyOn(updatesDb.updates, 'add').mockRejectedValue(new Error('quota exceeded'))

      ydoc.getMap('t').set('rescued-push', 1)
      await settle()
      expect(await updatesDb.updates.count()).toBe(0)

      await vi.advanceTimersByTimeAsync(1_500)
      await settle()

      expect(pushSync).toHaveBeenCalledTimes(1)
      expect(pushSync.mock.calls[0][0]).toHaveLength(1)
      expect(getSyncStatusSnapshot()).toMatchObject({ lastFailure: null, attemptsExhausted: false })
    })

    it('is re-queued into the outbox once writes work again', async () => {
      newSync()
      await settle()

      vi.spyOn(updatesDb.updates, 'add').mockRejectedValueOnce(new Error('quota exceeded'))

      ydoc.getMap('t').set('healed', 1)
      await settle()
      expect(await updatesDb.updates.count()).toBe(0)

      await vi.advanceTimersByTimeAsync(1_500)
      await settle()

      expect(await updatesDb.updates.count()).toBe(1)
      expect(await pendingCount()).toBe(0)
      expect(pushSync).toHaveBeenCalledTimes(1)
    })

    // The dropped-edit report survived only as a status field the UI could not render,
    // and the next successful cycle erased it under "All changes synced".
    it('keeps the failure reported across a successful pull while it is still unsent', async () => {
      newSync()
      await settle()

      vi.spyOn(updatesDb.updates, 'add').mockRejectedValue(new Error('quota exceeded'))

      ydoc.getMap('t').set('still-unsent', 1)
      await settle()
      expect(getSyncStatusSnapshot()).toMatchObject({ lastFailure: 'client', attemptsExhausted: true })

      await sync!.pull()
      await settle()

      expect(pullSync).toHaveBeenCalledTimes(1)
      expect(getSyncStatusSnapshot()).toMatchObject({ lastFailure: 'client', attemptsExhausted: true })
    })

    it('is still reported as failed after a push that could not carry it', async () => {
      newSync()
      await settle()

      vi.spyOn(updatesDb.updates, 'add').mockRejectedValue(new Error('quota exceeded'))
      pushSync.mockResolvedValue(failed('client', 403))

      ydoc.getMap('t').set('push-rejected', 1)
      await settle()
      await vi.advanceTimersByTimeAsync(1_500)
      await settle()

      expect(pushSync).toHaveBeenCalledTimes(1)
      expect(getSyncStatusSnapshot()).toMatchObject({ lastFailure: 'client', attemptsExhausted: true })
    })

    // C1's other half: the edit being retained is worthless if the UI still says
    // "All changes synced". A rescued row is in no Dexie table, so pendingCount is 0
    // and the phase resolved to 'idle' until unqueuedCount was published.
    it('is visible to derivePhase even though the outbox count stays at zero', async () => {
      newSync()
      setSyncEnabled(true)
      await settle()

      vi.spyOn(updatesDb.updates, 'add').mockRejectedValue(new Error('quota exceeded'))

      ydoc.getMap('t').set('must-be-visible', 1)
      await settle()

      expect(await pendingCount()).toBe(0)
      expect(getSyncStatusSnapshot().unqueuedCount).toBe(1)
      expect(derivePhase({
        ...getSyncStatusSnapshot(),
        connection: 'online',
        pendingCount: await pendingCount(),
      })).toBe('error')
    })

    it('stops being counted as unqueued once the server confirms it', async () => {
      newSync()
      setSyncEnabled(true)
      await settle()

      vi.spyOn(updatesDb.updates, 'add').mockRejectedValue(new Error('quota exceeded'))

      ydoc.getMap('t').set('confirmed', 1)
      await settle()
      expect(getSyncStatusSnapshot().unqueuedCount).toBe(1)

      await vi.advanceTimersByTimeAsync(1_500)
      await settle()

      expect(pushSync).toHaveBeenCalledTimes(1)
      expect(getSyncStatusSnapshot().unqueuedCount).toBe(0)
      expect(derivePhase({
        ...getSyncStatusSnapshot(),
        connection: 'online',
        pendingCount: await pendingCount(),
      })).toBe('idle')
    })

    it('gets one more attempt on destroy when it is still unsent', async () => {
      newSync()
      await settle()

      vi.spyOn(updatesDb.updates, 'add').mockRejectedValue(new Error('quota exceeded'))
      pushSync.mockResolvedValue(failed('client', 403))

      ydoc.getMap('t').set('unsent-at-teardown', 1)
      await settle()
      await vi.advanceTimersByTimeAsync(1_500)
      await settle()
      expect(pushSync).toHaveBeenCalledTimes(1)

      pushSync.mockResolvedValue(OK_PUSH)
      sync!.destroy()
      await settle()

      expect(pushSync).toHaveBeenCalledTimes(2)
    })
  })

  describe('the push debounce', () => {
    it('pushes after the 1500ms debounce', async () => {
      newSync()
      await settle()

      ydoc.getMap('t').set('debounced', 1)
      await settle()
      expect(pushSync).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1_500)
      await settle()

      expect(pushSync).toHaveBeenCalledTimes(1)
    })

    it('fires at the 5000ms max wait even while edits keep arriving', async () => {
      newSync()
      await settle()

      for (let i = 0; i < 5; i++) {
        ydoc.getMap('t').set(`burst-${i}`, i)
        await settle()
        expect(pushSync).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1_000)
        await settle()
      }

      ydoc.getMap('t').set('burst-5', 5)
      await settle()

      expect(pushSync).toHaveBeenCalledTimes(1)
    })
  })

  describe('the flush cycle', () => {
    it('flushes leftover unsynced rows on construction, with no local edit', async () => {
      await seedRows(2)
      newSync()
      await settle()

      expect(pushSync).toHaveBeenCalledTimes(1)
      expect(pushSync.mock.calls[0][0]).toHaveLength(2)
    })

    it('marks rows synced only after a confirmed ok', async () => {
      await seedRows(1)
      newSync()
      await settle()

      expect(await pendingCount()).toBe(0)
    })

    it('leaves rows unsynced when the push returns a server failure', async () => {
      pushSync.mockResolvedValue(failed('server', 500))
      await seedRows(1)
      newSync()
      await settle()

      expect(pushSync).toHaveBeenCalledTimes(1)
      expect(await pendingCount()).toBe(1)
    })

    it('does not double-send when flush is called three times concurrently', async () => {
      newSync()
      await settle()
      await seedRows(1)

      const first = sync!.flush()
      const second = sync!.flush()
      const third = sync!.flush()
      expect(second).toBe(first)
      expect(third).toBe(first)

      await Promise.all([first, second, third])
      await settle()

      expect(pushSync).toHaveBeenCalledTimes(1)
    })

    it('works when navigator.locks is defined', async () => {
      const request = vi.fn((_name: string, fn: () => Promise<void>) => fn())
      Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })

      await seedRows(1)
      newSync()
      await settle()

      expect(request).toHaveBeenCalledWith('money-sync-push', expect.any(Function))
      expect(pushSync).toHaveBeenCalledTimes(1)
    })
  })

  describe('bounded retry', () => {
    it('retries on the documented curve', async () => {
      pushSync.mockResolvedValue(failed('server', 500))
      await seedRows(1)
      newSync()
      await settle()
      expect(pushSync).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1_999)
      await settle()
      expect(pushSync).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1)
      await settle()
      expect(pushSync).toHaveBeenCalledTimes(2)

      await vi.advanceTimersByTimeAsync(6_000)
      await settle()
      expect(pushSync).toHaveBeenCalledTimes(3)

      await vi.advanceTimersByTimeAsync(18_000)
      await settle()
      expect(pushSync).toHaveBeenCalledTimes(4)

      await vi.advanceTimersByTimeAsync(54_000)
      await settle()
      expect(pushSync).toHaveBeenCalledTimes(5)
    })

    it('stops after five attempts and reports exhausted', async () => {
      pushSync.mockResolvedValue(failed('server', 500))
      await seedRows(1)
      newSync()
      await settle()

      await vi.advanceTimersByTimeAsync(80_000)
      await settle()
      expect(pushSync).toHaveBeenCalledTimes(5)

      await vi.advanceTimersByTimeAsync(300_000)
      await settle()
      expect(pushSync).toHaveBeenCalledTimes(5)
      expect(getSyncStatusSnapshot()).toMatchObject({ lastFailure: 'server', attemptsExhausted: true })
      expect(await pendingCount()).toBe(1)
    })

    it('does not retry a client failure', async () => {
      pushSync.mockResolvedValue(failed('client', 403))
      await seedRows(1)
      newSync()
      await settle()

      await vi.advanceTimersByTimeAsync(300_000)
      await settle()

      expect(pushSync).toHaveBeenCalledTimes(1)
      expect(await pendingCount()).toBe(1)
    })

    it('does not retry an auth failure', async () => {
      pushSync.mockResolvedValue(failed('auth', 401))
      await seedRows(1)
      newSync()
      await settle()

      await vi.advanceTimersByTimeAsync(300_000)
      await settle()

      expect(pushSync).toHaveBeenCalledTimes(1)
      expect(getSyncStatusSnapshot().lastFailure).toBe('auth')
    })

    it('uses Retry-After instead of the curve on a 429', async () => {
      pushSync.mockResolvedValue(failed('server', 429, { retryAfterMs: 45_000 }))
      await seedRows(1)
      newSync()
      await settle()
      expect(pushSync).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(44_999)
      await settle()
      expect(pushSync).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1)
      await settle()
      expect(pushSync).toHaveBeenCalledTimes(2)
    })

    it('parks without consuming attempts when navigator.onLine is false', async () => {
      pushSync.mockImplementation(async () => {
        setOnline(false)
        return failed('network', 0)
      })
      await seedRows(1)
      newSync()
      await settle()

      await vi.advanceTimersByTimeAsync(300_000)
      await settle()

      expect(pushSync).toHaveBeenCalledTimes(1)
      expect(getSyncStatusSnapshot()).toMatchObject({ attempt: 0, attemptsExhausted: false })
    })

    it('resumes and flushes on the online event', async () => {
      setOnline(false)
      await seedRows(1)
      newSync()
      await settle()
      expect(pushSync).not.toHaveBeenCalled()

      setOnline(true)
      window.dispatchEvent(new Event('online'))
      await settle()

      expect(pushSync).toHaveBeenCalledTimes(1)
      expect(await pendingCount()).toBe(0)
    })
  })

  describe('separate push and pull mutexes', () => {
    it('a pull requested during a push retry cycle actually pulls', async () => {
      pushSync.mockResolvedValue(failed('server', 500))
      await seedRows(1)
      newSync()
      await settle()
      expect(pushSync).toHaveBeenCalledTimes(1)

      await sync!.pull()

      expect(pullSync).toHaveBeenCalledTimes(1)
      expect(pushSync).toHaveBeenCalledTimes(1)
    })
  })

  describe('batching', () => {
    it('batches 1200 rows into 500 / 500 / 200', async () => {
      await seedRows(1_200)
      newSync()

      await until(() => pushSync.mock.calls.length >= 3)
      await settle()

      expect(pushSync).toHaveBeenCalledTimes(3)
      expect(pushSync.mock.calls.map(call => call[0].length)).toEqual([500, 500, 200])
      expect(await pendingCount()).toBe(0)
      // fake-indexeddb walks three 500-key anyOf().modify() cursors here, which is
      // real work: this lands at 4.0-4.7s against the 5s default and flakes under
      // full-suite CPU contention. The assertions above are unchanged.
    }, 30_000)

    it('batches on the byte cap as well as the row cap', async () => {
      await seedRows(3, 600_000)
      newSync()

      await until(() => pushSync.mock.calls.length >= 3)
      await settle()

      expect(pushSync).toHaveBeenCalledTimes(3)
      expect(pushSync.mock.calls.map(call => call[0].length)).toEqual([1, 1, 1])
    })
  })

  describe('the pull cursor', () => {
    it('sends sinceId when lastSyncUpdateId is stored', async () => {
      await updatesDb.syncMetadata.put({ key: SYNC_META_KEYS.lastSyncUpdateId, value: 42 })
      newSync()
      await settle()

      await sync!.pull()

      expect(pullSync).toHaveBeenCalledWith({ sinceId: 42 })
    })

    it('sends since minus 2000 when only the legacy timestamp is stored', async () => {
      await updatesDb.syncMetadata.put({ key: SYNC_META_KEYS.lastSyncTimestamp, value: 10_000 })
      newSync()
      await settle()

      await sync!.pull()

      expect(pullSync).toHaveBeenCalledWith({ since: 8_000 })
    })

    it('adopts latestId and deletes the legacy timestamp key after a successful pull', async () => {
      await updatesDb.syncMetadata.put({ key: SYNC_META_KEYS.lastSyncTimestamp, value: 10_000 })
      pullSync.mockResolvedValue(okPull({ updates: [], latestId: 77 }))
      newSync()
      await settle()

      await sync!.pull()
      await settle()

      expect((await updatesDb.syncMetadata.get(SYNC_META_KEYS.lastSyncUpdateId))?.value).toBe(77)
      expect(await updatesDb.syncMetadata.get(SYNC_META_KEYS.lastSyncTimestamp)).toBeUndefined()
    })

    it('falls back to the created_at cursor when latestId is absent', async () => {
      pullSync.mockResolvedValue(okPull({
        updates: [{ update: encodedUpdate('legacy', 1), timestamp: 1, deviceId: 'other', created_at: 5_000 }],
      }))
      newSync()
      await settle()

      await sync!.pull()
      await settle()

      expect((await updatesDb.syncMetadata.get(SYNC_META_KEYS.lastSyncTimestamp))?.value).toBe(5_000)
      expect(await updatesDb.syncMetadata.get(SYNC_META_KEYS.lastSyncUpdateId)).toBeUndefined()
    })

    it('does not advance the cursor when the pull fails', async () => {
      pullSync.mockResolvedValue(failed('client', 403))
      newSync()
      await settle()

      await sync!.pull()
      await settle()

      expect(await updatesDb.syncMetadata.count()).toBe(0)
    })

    it('skips an unapplicable update and still applies the good ones and advances', async () => {
      const garbage = btoa(String.fromCharCode(255, 255, 255, 255, 255, 255, 255, 255))
      pullSync.mockResolvedValue(okPull({
        updates: [
          { update: garbage, timestamp: 1, deviceId: 'other', created_at: 4_000 },
          { update: encodedUpdate('survivor', 'yes'), timestamp: 2, deviceId: 'other', created_at: 6_000 },
        ],
      }))
      newSync()
      await settle()

      await sync!.pull()
      await settle()

      expect(ydoc.getMap('t').get('survivor')).toBe('yes')
      expect((await updatesDb.syncMetadata.get(SYNC_META_KEYS.lastSyncTimestamp))?.value).toBe(6_000)
    })

    it('does not spread a large update array when computing the fallback cursor', async () => {
      const empty = toBase64(Y.encodeStateAsUpdate(new Y.Doc()))
      pullSync.mockResolvedValue(okPull({
        updates: Array.from({ length: 5_000 }, (_, i) => ({
          update: empty,
          timestamp: i,
          deviceId: 'other',
          created_at: i + 1,
        })),
      }))
      newSync()
      await settle()

      await sync!.pull()
      await settle()

      expect((await updatesDb.syncMetadata.get(SYNC_META_KEYS.lastSyncTimestamp))?.value).toBe(5_000)
    })

    it('runs the initial full-state push after the pull, not before', async () => {
      ydoc.getMap('t').set('state', 'present')

      const order: string[] = []
      pushSync.mockImplementation(async () => { order.push('push'); return OK_PUSH })
      pullSync.mockImplementation(async () => { order.push('pull'); return okPull() })

      newSync()
      await settle()
      order.length = 0

      await sync!.pull('2024-01-01T00:00:00.000Z')
      await settle()

      expect(order[0]).toBe('pull')
      expect(order).toContain('push')
    })
  })

  describe('the initial full-state upload', () => {
    it('does not start a second one while the first is still in flight', async () => {
      ydoc.getMap('t').set('state', 'present')
      pushSync.mockImplementation(() => new Promise(() => {}))

      newSync()
      await settle()

      await sync!.pull('2024-01-01T00:00:00.000Z')
      await settle()
      await sync!.pull()
      await settle()
      await sync!.pull()
      await settle()

      expect(pushSync).toHaveBeenCalledTimes(1)
      expect(pushSync.mock.calls[0][1]).toEqual({ timeoutMs: API_TIMEOUTS.syncInitialPush })
    })

    it('runs once, not on every pull', async () => {
      ydoc.getMap('t').set('state', 'present')

      newSync()
      await settle()

      await sync!.pull('2024-01-01T00:00:00.000Z')
      await settle()
      await sync!.pull()
      await settle()
      await sync!.pull()
      await settle()

      expect(pushSync).toHaveBeenCalledTimes(1)
    })

    it('is retried by a later pull when it failed, then stops', async () => {
      ydoc.getMap('t').set('state', 'present')
      pushSync.mockResolvedValueOnce(failed('server', 500))

      newSync()
      await settle()

      await sync!.pull('2024-01-01T00:00:00.000Z')
      await settle()
      expect(pushSync).toHaveBeenCalledTimes(1)

      await sync!.pull()
      await settle()
      expect(pushSync).toHaveBeenCalledTimes(2)

      await sync!.pull()
      await settle()
      expect(pushSync).toHaveBeenCalledTimes(2)
    })
  })

  describe('connectivity gating', () => {
    it("still attempts a push and a pull while the connection is 'unreachable'", async () => {
      reportRequestOutcome('network-failure')
      reportRequestOutcome('network-failure')
      expect(getConnectionState()).toBe('unreachable')

      await seedRows(1)
      newSync()
      await settle()

      await sync!.pull()
      await settle()

      expect(pushSync).toHaveBeenCalledTimes(1)
      expect(pullSync).toHaveBeenCalledTimes(1)
    })

    it('skips both while the browser is genuinely offline', async () => {
      setOnline(false)

      await seedRows(1)
      newSync()
      await settle()

      await sync!.pull()
      await settle()

      expect(pushSync).not.toHaveBeenCalled()
      expect(pullSync).not.toHaveBeenCalled()
    })
  })

  describe('lifecycle triggers', () => {
    it('flushes and pulls on visibilitychange to visible', async () => {
      newSync()
      await settle()
      await seedRows(1)

      document.dispatchEvent(new Event('visibilitychange'))
      await settle()

      expect(pushSync).toHaveBeenCalledTimes(1)
      expect(pullSync).toHaveBeenCalledTimes(1)
    })

    it('throttles the visibility pull to once per 30 seconds while still flushing', async () => {
      newSync()
      await settle()

      await seedRows(1)
      document.dispatchEvent(new Event('visibilitychange'))
      await settle()
      expect(pullSync).toHaveBeenCalledTimes(1)

      await seedRows(1)
      await vi.advanceTimersByTimeAsync(5_000)
      document.dispatchEvent(new Event('visibilitychange'))
      await settle()

      expect(pullSync).toHaveBeenCalledTimes(1)
      expect(pushSync).toHaveBeenCalledTimes(2)
    })

    it('flushes on pagehide', async () => {
      newSync()
      await settle()

      ydoc.getMap('t').set('unsent', 1)
      await settle()
      expect(pushSync).not.toHaveBeenCalled()

      window.dispatchEvent(new Event('pagehide'))
      await settle()

      expect(pushSync).toHaveBeenCalledTimes(1)
    })
  })

  describe('destroy', () => {
    it('resolves a pending retry sleep and returns', async () => {
      pushSync.mockResolvedValue(failed('server', 500))
      await seedRows(1)
      newSync()
      await settle()
      expect(pushSync).toHaveBeenCalledTimes(1)

      let resolved = false
      const pending = sync!.flush().then(() => { resolved = true })

      sync!.destroy()
      await settle()

      expect(resolved).toBe(true)
      await pending
    })

    it('resolves a push retry and a pull retry that are sleeping at the same time', async () => {
      pushSync.mockResolvedValue(failed('server', 500, { retryAfterMs: 120_000 }))
      pullSync.mockResolvedValue(failed('server', 500))
      await seedRows(1)
      newSync()
      await settle()
      expect(pushSync).toHaveBeenCalledTimes(1)

      let flushResolved = false
      const flushPromise = sync!.flush().then(() => { flushResolved = true })
      let pullResolved = false
      const pullPromise = sync!.pull().then(() => { pullResolved = true })
      await settle()
      expect(pullSync).toHaveBeenCalledTimes(1)

      // The pull's 2s sleep expires while the push is still sleeping for 120s. With a
      // single shared handle pair, this timer nulled the push's slot, so destroy() could
      // cancel neither and the flush promise hung until the orphaned timer fired.
      await vi.advanceTimersByTimeAsync(2_000)
      await settle()
      expect(pullSync).toHaveBeenCalledTimes(2)

      sync!.destroy()
      await settle()

      expect(flushResolved).toBe(true)
      expect(pullResolved).toBe(true)
      await Promise.all([flushPromise, pullPromise])
    })

    it('removes the window listeners', async () => {
      newSync()
      await settle()
      sync!.destroy()

      pushSync.mockClear()
      await seedRows(1)
      window.dispatchEvent(new Event('online'))
      await settle()

      expect(pushSync).not.toHaveBeenCalled()
    })

    it('detaches the doc listener', async () => {
      newSync()
      await settle()
      sync!.destroy()
      await settle()

      ydoc.getMap('t').set('after-destroy', 1)
      await settle()

      expect(await updatesDb.updates.count()).toBe(0)
    })
  })
})
