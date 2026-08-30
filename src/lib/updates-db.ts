import Dexie, { type Table } from 'dexie'

export interface YjsUpdate {
  id?: number
  update: Uint8Array
  timestamp: number
  synced: 0 | 1  // Dexie works better with numeric values for indexed boolean fields
  deviceId: string
}

export interface SyncMetadata {
  key: string
  value: number | string
}

export const updatesDb = new Dexie('UpdatesDB') as Dexie & {
  updates: Table<YjsUpdate, number>
  syncMetadata: Table<SyncMetadata, string>
}

// Deliberately pinned at version 1: DebugModal used to open this database with a
// hardcoded version(1), and opening at a lower version than the stored one throws
// VersionError. Nothing in the sync design needs a schema change.
updatesDb.version(1).stores({
  updates: '++id, timestamp, synced, deviceId',
  syncMetadata: 'key'
})

export const SYNC_META_KEYS = {
  lastSyncTimestamp: 'lastSyncTimestamp',
  lastSyncUpdateId: 'lastSyncUpdateId',
  lastPremiumSync: 'lastPremiumSyncTimestamp',
} as const

export function countPendingUpdates(): Promise<number> {
  return updatesDb.updates.where('synced').equals(0).count()
}
