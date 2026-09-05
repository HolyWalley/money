import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockClearPersistedDocument = vi.hoisted(() => vi.fn())

vi.mock('./crdts', () => ({
  clearPersistedDocument: () => mockClearPersistedDocument(),
}))

import { clearLocalData } from './local-reset'
import { db as moneyDb } from './db-dexie'
import { updatesDb } from './updates-db'

// Every table gets the same row: Dexie takes whichever key it is indexed on and
// ignores the rest, so one shape seeds them all without naming any by hand.
async function seedEveryTable() {
  const now = new Date()
  await Promise.all(
    moneyDb.tables.map(table =>
      table.put({
        _id: `seed-${table.name}`,
        key: `seed-${table.name}`,
        createdAt: now,
        updatedAt: now,
      })
    )
  )
}

async function rowCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const table of moneyDb.tables) {
    counts[table.name] = await table.count()
  }
  return counts
}

describe('clearLocalData', () => {
  beforeEach(async () => {
    mockClearPersistedDocument.mockClear()
    mockClearPersistedDocument.mockResolvedValue(undefined)
    await Promise.all(moneyDb.tables.map(table => table.clear()))
    await updatesDb.updates.clear()
    await updatesDb.syncMetadata.clear()
  })

  // Naming the tables by hand is what went wrong before: three of six were
  // cleared, and recurring payments, their logs and saving goals survived an
  // import meant to replace them.
  it('empties every table holding the user data', async () => {
    await seedEveryTable()

    await clearLocalData()

    const counts = await rowCounts()
    for (const table of moneyDb.tables) {
      if (table.name === 'exchangeRates') continue
      expect(counts[table.name], `${table.name} should be empty`).toBe(0)
    }
  })

  // Rates come from a public API, cost a round trip to rebuild and say nothing
  // about the user.
  it('keeps the exchange rate cache', async () => {
    await seedEveryTable()

    await clearLocalData()

    expect(await moneyDb.exchangeRates.count()).toBe(1)
  })

  it('empties the sync outbox and its cursors', async () => {
    await updatesDb.updates.add({
      update: new Uint8Array([1, 2, 3]),
      timestamp: Date.now(),
      synced: 0,
      deviceId: 'device-1',
    })
    await updatesDb.syncMetadata.put({ key: 'lastSyncUpdateId', value: 42 })

    await clearLocalData()

    expect(await updatesDb.updates.count()).toBe(0)
    expect(await updatesDb.syncMetadata.count()).toBe(0)
  })

  // The tables are a projection of the document. Emptying them without deleting
  // it leaves the old data to be restored on reload and merged with whatever
  // the next pull brings.
  it('deletes the document the tables are projected from', async () => {
    await clearLocalData()

    expect(mockClearPersistedDocument).toHaveBeenCalledTimes(1)
  })

  it('does not fall over when there is nothing to clear', async () => {
    await expect(clearLocalData()).resolves.toBeUndefined()
  })
})
