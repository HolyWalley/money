import { useMemo, useSyncExternalStore } from 'react'
import { createSharedLiveQuery } from '@/lib/shared-live-query'
import { countPendingUpdates } from '@/lib/updates-db'
import { SYNC_TIMING } from '@/lib/backoff'
import {
  derivePhase,
  getSyncStatusSnapshot,
  subscribeSyncStatus,
  type SyncStatus,
} from '@/lib/sync-status'
import { useNetworkStatus } from './useNetworkStatus'

// `synced` is a standalone index, so Dexie takes the IDBIndex.count(keyRange) fast
// path and never deserialises the update blobs.
const usePendingCountQuery = createSharedLiveQuery(() => countPendingUpdates())

export function usePendingUpdateCount(): number {
  return usePendingCountQuery() ?? 0
}

export function useSyncStatus(): SyncStatus {
  const snap = useSyncExternalStore(subscribeSyncStatus, getSyncStatusSnapshot, getSyncStatusSnapshot)
  const pendingCount = usePendingUpdateCount()
  const connection = useNetworkStatus()

  return useMemo(() => ({
    phase: derivePhase({ ...snap, connection, pendingCount }),
    pendingCount,
    unqueuedCount: snap.unqueuedCount,
    lastSyncedAt: snap.lastSyncedAt,
    nextRetryAt: snap.nextRetryAt,
    attempt: snap.attempt,
    maxAttempts: SYNC_TIMING.maxAttempts,
  }), [snap, connection, pendingCount])
}
