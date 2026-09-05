import * as Y from 'yjs'
import { ydoc as doc } from './crdts'
import {
  apiClient,
  API_TIMEOUTS,
  isRetryableFailure,
  type SyncPullQuery,
  type SyncResponse,
  type SyncUpdate,
} from './api-client'
import { SYNC_META_KEYS, updatesDb, type YjsUpdate } from './updates-db'
import { backoffDelayMs, SYNC_TIMING } from './backoff'
import { getConnectionState } from './network-status'
import { endRestore, isAwaitingRestoredData, isRestorePending } from './pending-restore'
import {
  beginSyncOperation,
  endSyncOperation,
  registerSyncController,
  reportSyncFailed,
  reportSyncSucceeded,
  reportUnqueuedUpdates,
  resetSyncAttempts,
} from './sync-status'

type PushBatch = { ids: number[]; payload: SyncUpdate[]; rescued: YjsUpdate[] }
type PushOutcome = 'ok' | 'stop' | 'park' | 'exhausted'
type RetrySleep = { timeout: ReturnType<typeof setTimeout> | null; resolve: () => void }

// An outbox that keeps rejecting would otherwise grow the in-memory rescue buffer
// without limit for as long as the tab stays open.
const MAX_RESCUED_UPDATES = 500

export class Sync {
  private deviceId: string
  private random: () => number
  private premiumActivatedAt: string | undefined = undefined

  private updateListener: ((update: Uint8Array, origin: string | object | null) => void) | null = null
  private onlineHandler: () => void
  private visibilityHandler: () => void
  private pagehideHandler: () => void

  private pushTimeout: ReturnType<typeof setTimeout> | null = null
  private firstScheduledAt: number | null = null

  private flushInFlight: Promise<void> | null = null
  private pullInFlight: Promise<void> | null = null
  private flushAgain = false
  private pullAgain = false

  // One handle per sleep: push and pull have independent retry loops (D11), so a
  // single shared pair let the second sleeper orphan the first one's timer.
  private retrySleeps = new Set<RetrySleep>()
  private destroyed = false
  private lastPullAt = 0

  // Local updates the outbox refused. They exist nowhere else that sync can reach,
  // so they are pushed straight from memory until the outbox accepts them.
  private rescued: YjsUpdate[] = []

  private initialSyncInFlight: Promise<void> | null = null
  private initialSyncSettled = false

  constructor(deviceId: string, options?: { random?: () => number }) {
    this.deviceId = deviceId
    this.random = options?.random ?? Math.random

    this.setupLocalListener()
    registerSyncController(this)
    // The store outlives an instance swap; a fresh instance owns no rescued rows, so
    // it must clear a predecessor's count rather than leave the UI stuck in 'error'.
    this.publishUnqueued()

    this.onlineHandler = () => {
      resetSyncAttempts()
      void this.syncNow()
    }

    this.visibilityHandler = () => {
      if (document.visibilityState !== 'visible') return
      resetSyncAttempts()
      void this.flush()
      // iOS Safari fires visibilitychange on every app-switcher pass; throttling the
      // pull keeps an alt-tab habit off the 60-req/min per-IP budget.
      if (Date.now() - this.lastPullAt >= SYNC_TIMING.pullMinIntervalMs) {
        void this.pull()
      }
    }

    this.pagehideHandler = () => {
      if (!this.pushTimeout) return
      this.clearPushTimer()
      void this.flush()
    }

    window.addEventListener('online', this.onlineHandler)
    document.addEventListener('visibilitychange', this.visibilityHandler)
    // pagehide is the reliable mobile-Safari lifecycle event; beforeunload is not.
    window.addEventListener('pagehide', this.pagehideHandler)

    // Without this, rows left unsynced by a previous session sit in the outbox
    // until the user's next local edit happens to arm the debounce.
    void this.flush()
  }

  setPremiumActivatedAt(value: string | undefined): void {
    if (value === this.premiumActivatedAt) return
    this.premiumActivatedAt = value
    // A re-activation stamps a new activatedAt, which needs a fresh full-state upload.
    this.initialSyncSettled = false
  }

  flush(): Promise<void> {
    return this.guard('flush', () => this.withLock('money-sync-push', () => this.runFlush()))
  }

  pull(premiumActivatedAt?: string): Promise<void> {
    if (premiumActivatedAt !== undefined) this.setPremiumActivatedAt(premiumActivatedAt)
    return this.guard('pull', () => this.runPull())
  }

  async syncNow(premiumActivatedAt?: string): Promise<void> {
    if (premiumActivatedAt !== undefined) this.setPremiumActivatedAt(premiumActivatedAt)
    // Push first so local work leaves the device before we spend the connection reading.
    await this.flush()
    await this.pull()
  }

  destroy(): void {
    this.destroyed = true
    registerSyncController(null)

    window.removeEventListener('online', this.onlineHandler)
    document.removeEventListener('visibilitychange', this.visibilityHandler)
    window.removeEventListener('pagehide', this.pagehideHandler)

    if (this.updateListener) {
      doc.off('update', this.updateListener)
      this.updateListener = null
    }

    // Clearing a timer without resolving would leave that retry promise pending
    // forever: the cycle would never return, flushInFlight would never be nulled,
    // and the final flush below would resolve to that same hung promise.
    const sleeps = [...this.retrySleeps]
    this.retrySleeps.clear()
    for (const sleep of sleeps) {
      if (sleep.timeout) clearTimeout(sleep.timeout)
      sleep.resolve()
    }

    if (this.pushTimeout || this.rescued.length > 0) {
      this.clearPushTimer()
      void this.flush()
    }
  }

  private setupLocalListener(): void {
    this.updateListener = async (update: Uint8Array, origin: string | object | null) => {
      // Skip updates that came from sync
      if (origin === 'sync') return

      // Skip updates from y-indexeddb loading (these are already persisted locally)
      // Check for properties unique to IndexeddbPersistence instead of class name (which gets minified)
      if (origin && typeof origin === 'object' &&
        'synced' in origin &&
        'whenSynced' in origin &&
        'name' in origin &&
        origin.name === 'money') {
        return
      }

      const row: YjsUpdate = {
        update,
        timestamp: Date.now(),
        synced: 0,
        deviceId: this.deviceId,
      }

      try {
        await updatesDb.updates.add(row)
      } catch (error) {
        // Yjs does not await this listener and never re-emits, so letting this row go
        // would drop the edit from sync silently and forever. Holding it in memory keeps
        // it pushable; the failure stays reported until it actually reaches the server.
        console.error('Failed to queue update for sync:', error)
        this.rescue(row)
        reportSyncFailed('client', null, 0, true)
      }

      this.schedulePush()
    }

    doc.on('update', this.updateListener)
  }

  private clearPushTimer(): void {
    if (this.pushTimeout) clearTimeout(this.pushTimeout)
    this.pushTimeout = null
    this.firstScheduledAt = null
  }

  private schedulePush(): void {
    const now = Date.now()
    if (this.firstScheduledAt === null) this.firstScheduledAt = now

    // A bulk import re-arming the trailing timer on every update would otherwise
    // starve the push indefinitely.
    if (now - this.firstScheduledAt >= SYNC_TIMING.pushMaxWaitMs) {
      this.clearPushTimer()
      void this.flush()
      return
    }

    if (this.pushTimeout) clearTimeout(this.pushTimeout)
    this.pushTimeout = setTimeout(() => {
      this.pushTimeout = null
      this.firstScheduledAt = null
      void this.flush()
    }, SYNC_TIMING.pushDebounceMs)
  }

  // Push and pull get one mutex each. Sharing a single mutex with one re-run flag
  // re-executes the FIRST caller's closure, silently turning a pull requested
  // during a push retry cycle into a duplicate push that never pulls.
  private guard(kind: 'flush' | 'pull', fn: () => Promise<void>): Promise<void> {
    const inFlight = kind === 'flush' ? this.flushInFlight : this.pullInFlight
    if (inFlight) {
      if (kind === 'flush') this.flushAgain = true
      else this.pullAgain = true
      return inFlight
    }

    const p = fn().finally(() => {
      if (kind === 'flush') {
        this.flushInFlight = null
        if (this.flushAgain) {
          this.flushAgain = false
          if (!this.destroyed) void this.flush()
        }
      } else {
        this.pullInFlight = null
        if (this.pullAgain) {
          this.pullAgain = false
          if (!this.destroyed) void this.pull()
        }
      }
    })

    if (kind === 'flush') this.flushInFlight = p
    else this.pullInFlight = p
    return p
  }

  private async withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks
    if (!locks) return fn()
    return locks.request(name, fn) as Promise<T>
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
      const handle: RetrySleep = { timeout: null, resolve }
      handle.timeout = setTimeout(() => {
        this.retrySleeps.delete(handle)
        resolve()
      }, ms)
      this.retrySleeps.add(handle)
    })
  }

  /**
   * A rescued update is unsynced work that countPendingUpdates() cannot see, so the
   * count has to be published separately or derivePhase resolves to 'idle' and the UI
   * claims everything is synced while a local edit is stranded in memory.
   */
  private publishUnqueued(): void {
    reportUnqueuedUpdates(this.rescued.length)
  }

  private rescue(row: YjsUpdate): void {
    this.rescued.push({
      update: row.update,
      timestamp: row.timestamp,
      synced: 0,
      deviceId: row.deviceId,
    })
    if (this.rescued.length > MAX_RESCUED_UPDATES) {
      console.error('Dropping the oldest unqueued update: the rescue buffer is full')
      this.rescued.splice(0, this.rescued.length - MAX_RESCUED_UPDATES)
    }
    this.publishUnqueued()
  }

  private forgetRescued(rows: YjsUpdate[]): void {
    if (rows.length === 0) return
    const sent = new Set(rows)
    this.rescued = this.rescued.filter(row => !sent.has(row))
    this.publishUnqueued()
  }

  /** Moves rescued updates back into the durable outbox once it accepts writes again. */
  private async drainRescued(): Promise<void> {
    for (const row of [...this.rescued]) {
      try {
        await updatesDb.updates.add(row)
      } catch (error) {
        console.error('Failed to re-queue a rescued update:', error)
        return
      }
      this.forgetRescued([row])
    }
  }

  private async runFlush(): Promise<void> {
    // 'unreachable' is deliberately not skipped: attempting is how we discover
    // that the connection came back.
    if (getConnectionState() === 'offline') return

    beginSyncOperation()
    try {
      await this.drainRescued()

      for (;;) {
        const batch = await this.readBatch()
        if (batch.ids.length === 0 && batch.rescued.length === 0) return

        const outcome = await this.pushBatch(batch)
        if (outcome !== 'ok' || this.destroyed) return
      }
    } catch (error) {
      console.error('Push sync error:', error)
    } finally {
      endSyncOperation()
    }
  }

  private async readBatch(): Promise<PushBatch> {
    const batch: PushBatch = { ids: [], payload: [], rescued: [] }
    let bytes = 0

    // Rescued updates go first: they are the ones with no durable copy to fall back on.
    for (const row of this.rescued) {
      if (batch.payload.length >= SYNC_TIMING.pushBatchMaxRows) break
      const encoded = this.toBase64(row.update)
      if (batch.payload.length > 0 && bytes + encoded.length > SYNC_TIMING.pushBatchMaxBytes) break
      batch.payload.push({ update: encoded, timestamp: row.timestamp, deviceId: row.deviceId })
      batch.rescued.push(row)
      bytes += encoded.length
    }

    // A dead outbox must not stop the rescued updates from being pushed.
    let rows: YjsUpdate[] = []
    try {
      rows = await updatesDb.updates
        .where('synced')
        .equals(0)
        .limit(SYNC_TIMING.pushBatchMaxRows)
        .toArray()
    } catch (error) {
      console.error('Failed to read the sync outbox:', error)
    }

    for (const row of rows) {
      if (row.id === undefined) continue
      if (batch.payload.length >= SYNC_TIMING.pushBatchMaxRows) break
      const encoded = this.toBase64(row.update)
      if (batch.payload.length > 0 && bytes + encoded.length > SYNC_TIMING.pushBatchMaxBytes) break
      batch.payload.push({ update: encoded, timestamp: row.timestamp, deviceId: row.deviceId })
      batch.ids.push(row.id)
      bytes += encoded.length
    }

    return batch
  }

  /**
   * A rescued update that is still only in memory means a local edit has not reached
   * the server, so reporting success would put "All changes synced" over lost data.
   */
  private reportCycleSucceeded(): void {
    if (this.rescued.length > 0) {
      reportSyncFailed('client', null, 0, true)
      return
    }
    reportSyncSucceeded(Date.now())
  }

  private async pushBatch(batch: PushBatch): Promise<PushOutcome> {
    for (let attempt = 0; attempt < SYNC_TIMING.maxAttempts; attempt++) {
      const res = await apiClient.pushSync(batch.payload, { timeoutMs: API_TIMEOUTS.syncPush })

      if (res.ok) {
        this.forgetRescued(batch.rescued)
        // The DO is SQLite-backed and Cloudflare's output gate holds the response until
        // the writes commit, so a 200 implies durability. This ordering can only
        // duplicate, never lose - and Yjs absorbs duplicates.
        if (batch.ids.length > 0) {
          await updatesDb.updates.where('id').anyOf(batch.ids).modify({ synced: 1 })
        }
        this.reportCycleSucceeded()
        return 'ok'
      }

      const failure = res.failure
      if (failure === undefined || !isRetryableFailure(failure)) {
        reportSyncFailed(failure ?? 'client', null, attempt, true)
        return 'stop'
      }
      if (failure === 'network' && navigator.onLine === false) {
        // Parked rather than burned: the 'online' listener restarts the cycle.
        reportSyncFailed('network', null, attempt, false)
        return 'park'
      }
      if (attempt === SYNC_TIMING.maxAttempts - 1) {
        reportSyncFailed(failure, null, attempt, true)
        return 'exhausted'
      }

      const delay = backoffDelayMs(attempt, { retryAfterMs: res.retryAfterMs, random: this.random })
      reportSyncFailed(failure, Date.now() + delay, attempt + 1, false)
      await this.sleep(delay)
      if (this.destroyed) return 'stop'
    }

    return 'exhausted'
  }

  private async runPull(): Promise<void> {
    if (getConnectionState() === 'offline') return

    beginSyncOperation()
    try {
      await this.pullWithRetry()
    } catch (error) {
      console.error('Pull sync error:', error)
    } finally {
      this.lastPullAt = Date.now()
      endSyncOperation()
    }

    // The read path runs first and un-awaited: a hung full-state upload used to
    // block every pull, which is exactly the screen the user is waiting on.
    void this.ensureInitialSync()
  }

  /**
   * The full-state upload carries a 120s deadline and writes its persisted guard only
   * after it completes, so firing it from every pull let a slow link stack whole-document
   * uploads on top of each other. At most one runs, and only until it has succeeded.
   */
  private ensureInitialSync(): Promise<void> {
    if (this.initialSyncSettled || this.destroyed) return Promise.resolve()
    if (this.initialSyncInFlight) return this.initialSyncInFlight

    const run = this.performInitialSyncIfNeeded().finally(() => {
      this.initialSyncInFlight = null
    })
    this.initialSyncInFlight = run
    return run
  }

  private async pullWithRetry(): Promise<void> {
    const query = await this.resolvePullCursor()

    for (let attempt = 0; attempt < SYNC_TIMING.maxAttempts; attempt++) {
      const res = await apiClient.pullSync(query)

      if (res.ok) {
        await this.applyPulledUpdates(res.data)
        // The server's copy is in hand, so whatever was waiting on it - seeding
        // defaults, uploading state - may go ahead. Ended on any successful
        // pull, including an empty one: an account with nothing in it is still
        // an answer. Only this phase, though; a pull that lands while the old
        // document is still loaded settles nothing.
        if (isAwaitingRestoredData()) endRestore()
        this.reportCycleSucceeded()
        return
      }

      const failure = res.failure
      if (failure === undefined || !isRetryableFailure(failure)) {
        reportSyncFailed(failure ?? 'client', null, attempt, true)
        return
      }
      if (failure === 'network' && navigator.onLine === false) {
        reportSyncFailed('network', null, attempt, false)
        return
      }
      if (attempt === SYNC_TIMING.maxAttempts - 1) {
        reportSyncFailed(failure, null, attempt, true)
        return
      }

      const delay = backoffDelayMs(attempt, { retryAfterMs: res.retryAfterMs, random: this.random })
      reportSyncFailed(failure, Date.now() + delay, attempt + 1, false)
      await this.sleep(delay)
      if (this.destroyed) return
    }
  }

  private async resolvePullCursor(): Promise<SyncPullQuery> {
    const sinceId = await this.getMetadataNumber(SYNC_META_KEYS.lastSyncUpdateId)
    if (sinceId > 0) return { sinceId }

    const since = await this.getMetadataNumber(SYNC_META_KEYS.lastSyncTimestamp)
    // created_at has whole-second granularity, so a row written in the same second
    // as the stored cursor but after our last SELECT is skipped forever. Rewinding
    // once on the way to the id cursor sweeps that hole up.
    if (since > 0) return { since: Math.max(0, since - 2000) }

    return {}
  }

  private async applyPulledUpdates(data: SyncResponse | undefined): Promise<void> {
    const updates = data?.updates ?? []

    for (const update of updates) {
      const bytes = typeof update.update === 'string' ? this.fromBase64(update.update) : update.update
      try {
        Y.applyUpdate(doc, bytes, 'sync')
      } catch (error) {
        // A malformed update can never apply, so skipping it beats wedging every future
        // pull on the same byte.
        console.error('Skipping unapplicable update:', error)
      }
    }

    if (typeof data?.latestId === 'number') {
      await this.setMetadata(SYNC_META_KEYS.lastSyncUpdateId, data.latestId)
      await updatesDb.syncMetadata.delete(SYNC_META_KEYS.lastSyncTimestamp)
      return
    }

    // Math.max(...updates) RangeErrors on a large first-time backlog, and it would do
    // so after every update had already been applied, leaving the cursor stuck forever.
    const latestCreatedAt = updates.reduce((max, u) => Math.max(max, u.created_at || 0), 0)
    if (latestCreatedAt > 0) {
      await this.setMetadata(SYNC_META_KEYS.lastSyncTimestamp, latestCreatedAt)
    }
  }

  private async performInitialSyncIfNeeded(): Promise<void> {
    const premiumActivatedAt = this.premiumActivatedAt
    if (!premiumActivatedAt) return

    // The document is about to be replaced. Uploading it now would push the
    // very data the import is discarding straight back to the server, where the
    // next pull would hand it back again. Left unsettled so a later pull, once
    // the replacement has landed, uploads the right document instead.
    if (isRestorePending()) return

    try {
      const premiumActivatedTimestamp = new Date(premiumActivatedAt).getTime()
      const lastPremiumSync = await this.getMetadataNumber(SYNC_META_KEYS.lastPremiumSync)
      if (lastPremiumSync >= premiumActivatedTimestamp) {
        this.initialSyncSettled = true
        return
      }

      const stateUpdate = Y.encodeStateAsUpdate(doc)
      if (stateUpdate.length > 0) {
        const response = await apiClient.pushSync(
          [{ update: this.toBase64(stateUpdate), timestamp: Date.now(), deviceId: this.deviceId }],
          { timeoutMs: API_TIMEOUTS.syncInitialPush },
        )
        // Left unsettled on failure so a later pull can retry it; the in-flight guard is
        // what stops the retries from overlapping.
        if (!response.ok) return
      }

      await this.setMetadata(SYNC_META_KEYS.lastPremiumSync, Date.now())
      this.initialSyncSettled = true
    } catch (error) {
      console.error('Initial sync error:', error)
    }
  }

  private async getMetadataNumber(key: string): Promise<number> {
    try {
      const metadata = await updatesDb.syncMetadata.get(key)
      return (metadata?.value as number) || 0
    } catch (error) {
      console.error('Failed to load sync metadata:', error)
      return 0
    }
  }

  private async setMetadata(key: string, value: number): Promise<void> {
    try {
      await updatesDb.syncMetadata.put({ key, value })
    } catch (error) {
      console.error('Failed to save sync metadata:', error)
    }
  }

  private toBase64(data: Uint8Array): string {
    let binaryString = ''
    const chunkSize = 8192 // Process in chunks to avoid stack overflow
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.subarray(i, i + chunkSize)
      binaryString += String.fromCharCode(...chunk)
    }
    return btoa(binaryString)
  }

  private fromBase64(base64: string): Uint8Array {
    const binaryString = atob(base64)
    const len = binaryString.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes
  }
}
