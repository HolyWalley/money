import { beforeEach, describe, expect, it } from 'vitest'
import { countPendingUpdates, SYNC_META_KEYS, updatesDb } from './updates-db'

describe('updates-db', () => {
  beforeEach(async () => {
    await updatesDb.open()
    await updatesDb.updates.clear()
    await updatesDb.syncMetadata.clear()
  })

  it('countPendingUpdates reflects added unsynced rows', async () => {
    await updatesDb.updates.bulkAdd([
      { update: new Uint8Array([1]), timestamp: 1, synced: 0, deviceId: 'a' },
      { update: new Uint8Array([2]), timestamp: 2, synced: 0, deviceId: 'a' },
    ])

    expect(await countPendingUpdates()).toBe(2)
  })

  it('countPendingUpdates ignores rows marked synced', async () => {
    await updatesDb.updates.bulkAdd([
      { update: new Uint8Array([1]), timestamp: 1, synced: 1, deviceId: 'a' },
      { update: new Uint8Array([2]), timestamp: 2, synced: 0, deviceId: 'a' },
    ])

    expect(await countPendingUpdates()).toBe(1)
  })

  it('the declared schema version is 1', () => {
    expect(updatesDb.verno).toBe(1)
  })

  it('SYNC_META_KEYS values match the legacy on-disk keys', () => {
    expect(SYNC_META_KEYS).toEqual({
      lastSyncTimestamp: 'lastSyncTimestamp',
      lastSyncUpdateId: 'lastSyncUpdateId',
      lastPremiumSync: 'lastPremiumSyncTimestamp',
    })
  })
})
