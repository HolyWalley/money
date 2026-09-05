import { db as moneyDb } from './db-dexie'
import { updatesDb } from './updates-db'
import { clearPersistedDocument } from './crdts'

/**
 * Derived from a public rate API rather than from the user's document, so it
 * survives - it costs a round trip to rebuild and carries nothing personal.
 */
const PRESERVED_TABLES = new Set(['exchangeRates'])

/**
 * Throws away every local copy of the user's data: the sync outbox and cursors,
 * the Dexie projection, and the document the projection is built from.
 *
 * The tables are enumerated rather than listed by hand. Listing them by hand is
 * what went wrong before: three of the six were named, and the recurring
 * payments, their logs and the saving goals all survived an import that was
 * supposed to replace them.
 *
 * The caller must reload immediately afterwards. Until it does, the in-memory
 * document still holds the old data with nowhere to persist it, and sync would
 * happily upload it.
 */
export async function clearLocalData(): Promise<void> {
  await updatesDb.updates.clear()
  await updatesDb.syncMetadata.clear()

  await Promise.all(
    moneyDb.tables
      .filter(table => !PRESERVED_TABLES.has(table.name))
      .map(table => table.clear())
  )

  await clearPersistedDocument()
}
