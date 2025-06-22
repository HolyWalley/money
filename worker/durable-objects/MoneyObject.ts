import { DurableObject } from "cloudflare:workers";
import * as Y from 'yjs';

interface Update {
  update: Uint8Array;
  timestamp: number;
  deviceId: string;
  created_at?: number;
}

interface CompiledState {
  state: Uint8Array;
  last_update_timestamp: number;
  last_update_id: number;
  created_at: number;
}

export class MoneyObject extends DurableObject {
  private storage: DurableObjectState['storage'];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        "update" BLOB NOT NULL,
        timestamp INTEGER NOT NULL,
        deviceId TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      )`
    );

    // Table for storing compiled Y.js state
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS compiled_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        state BLOB NOT NULL,
        last_update_timestamp INTEGER NOT NULL,
        last_update_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      )`
    );

    this.storage = ctx.storage;
  }

  async pushUpdates(updates: Update[]): Promise<void> {
    console.debug(`[MoneyObject] pushUpdates called with ${updates.length} updates`);
    const insertedIds: number[] = [];

    for (const update of updates) {
      console.debug(`[MoneyObject] Processing update: deviceId=${update.deviceId}, updateLength=${update.update.length}, updateType=${update.update.constructor.name}`);

      // Store Uint8Array directly as BLOB in Durable Object SQL
      const result = this.storage.sql.exec(
        'INSERT INTO updates ("update", timestamp, deviceId) VALUES (?, ?, ?) RETURNING id',
        update.update,
        update.timestamp,
        update.deviceId
      );
      const resultsArray = Array.from(result);
      if (resultsArray.length > 0) {
        insertedIds.push(resultsArray[0].id as number);
        console.debug(`[MoneyObject] Inserted update with ID: ${resultsArray[0].id}`);
      }
    }

    // Update compiled state with only the new updates
    if (insertedIds.length > 0) {
      console.debug(`[MoneyObject] Updating compiled state with ${insertedIds.length} new updates`);
      await this.updateCompiledState(insertedIds);
    }
  }

  async getUpdates(since?: number): Promise<Update[]> {
    // If no 'since' parameter, return the compiled state as a single update
    if (!since) {
      const compiledState = await this.getCompiledState();
      if (compiledState) {
        return [{
          update: compiledState.state,
          timestamp: compiledState.last_update_timestamp,
          deviceId: 'compiled-state',
          created_at: compiledState.created_at
        }];
      }
      // Fallback to all updates if no compiled state exists
    }

    const query = since
      ? 'SELECT "update", timestamp, deviceId, created_at FROM updates WHERE created_at > ? ORDER BY created_at'
      : 'SELECT "update", timestamp, deviceId, created_at FROM updates ORDER BY created_at';

    const params = since ? [since] : [];

    const results = this.storage.sql.exec(query, ...params);

    const resultsArray = Array.from(results);

    const mappedResults = resultsArray.map(row => {
      const rawUpdate = row.update;
      const update = rawUpdate instanceof ArrayBuffer ? new Uint8Array(rawUpdate) : rawUpdate as Uint8Array;
      return {
        update: update,
        timestamp: row.timestamp as number,
        deviceId: row.deviceId as string,
        created_at: row.created_at as number
      };
    });

    return mappedResults;
  }

  private async getCompiledState(): Promise<CompiledState | null> {
    const results = this.storage.sql.exec(
      'SELECT state, last_update_timestamp, last_update_id, created_at FROM compiled_state WHERE id = 1'
    );

    const resultsArray = Array.from(results);
    if (resultsArray.length === 0) {
      return null;
    }

    const row = resultsArray[0];
    const rawState = row.state;
    const state = rawState instanceof ArrayBuffer ? new Uint8Array(rawState) : rawState as Uint8Array;

    return {
      state: state,
      last_update_timestamp: row.last_update_timestamp as number,
      last_update_id: row.last_update_id as number,
      created_at: row.created_at as number
    };
  }

  private async updateCompiledState(newUpdateIds: number[]): Promise<void> {
    try {
      console.debug(`[MoneyObject] updateCompiledState: Processing ${newUpdateIds.length} new update IDs: ${newUpdateIds.join(', ')}`);

      // Get current compiled state
      const currentState = await this.getCompiledState();
      console.debug(`[MoneyObject] Current compiled state: ${currentState ? `exists, length=${currentState.state.length}` : 'null'}`);

      // Get the new updates that need to be applied
      const newUpdates = await this.getUpdatesByIds(newUpdateIds);
      console.debug(`[MoneyObject] Retrieved ${newUpdates.length} new updates from DB`);

      if (newUpdates.length === 0) {
        console.debug(`[MoneyObject] No new updates to apply, returning`);
        return;
      }

      let doc: Y.Doc;

      if (currentState) {
        console.debug(`[MoneyObject] Applying existing compiled state to new doc`);
        // Apply existing state to a new doc
        doc = new Y.Doc();
        try {
          Y.applyUpdate(doc, currentState.state);
          console.debug(`[MoneyObject] Successfully applied existing compiled state`);
        } catch (error) {
          console.error(`[MoneyObject] Error applying existing compiled state:`, error);
          throw error;
        }
      } else {
        console.debug(`[MoneyObject] No existing state, starting fresh`);
        // No existing state, start fresh
        doc = new Y.Doc();
      }

      // Apply only the new updates
      for (let i = 0; i < newUpdates.length; i++) {
        const update = newUpdates[i];
        console.debug(`[MoneyObject] Applying update ${i + 1}/${newUpdates.length}: deviceId=${update.deviceId}, length=${update.update.length}, type=${update.update.constructor.name}`);
        try {
          Y.applyUpdate(doc, update.update);
          console.debug(`[MoneyObject] Successfully applied update ${i + 1}`);
        } catch (error) {
          console.error(`[MoneyObject] Error applying update ${i + 1}:`, error);
          throw error;
        }
      }

      // Encode the updated state and store directly as BLOB
      console.debug(`[MoneyObject] Encoding updated state`);
      const newCompiledState = Y.encodeStateAsUpdate(doc);
      console.debug(`[MoneyObject] New compiled state length: ${newCompiledState.length}`);

      const latestTimestamp = Math.max(...newUpdates.map(u => u.timestamp));
      const maxUpdateId = Math.max(...newUpdateIds);

      // Save or update the compiled state
      console.debug(`[MoneyObject] Saving compiled state to DB`);
      this.storage.sql.exec(
        `INSERT OR REPLACE INTO compiled_state (id, state, last_update_timestamp, last_update_id) 
         VALUES (1, ?, ?, ?)`,
        newCompiledState,
        latestTimestamp,
        maxUpdateId
      );
      console.debug(`[MoneyObject] Successfully saved compiled state`);

    } catch (error) {
      console.error('[MoneyObject] Failed to update compiled state:', error);
      // Don't throw - allow normal operation to continue
    }
  }

  private async getUpdatesByIds(updateIds: number[]): Promise<Update[]> {
    if (updateIds.length === 0) {
      return [];
    }

    console.debug(`[MoneyObject] getUpdatesByIds: Fetching updates for IDs: ${updateIds.join(', ')}`);
    const placeholders = updateIds.map(() => '?').join(',');
    const results = this.storage.sql.exec(
      `SELECT "update", timestamp, deviceId FROM updates WHERE id IN (${placeholders}) ORDER BY id`,
      ...updateIds
    );

    const resultsArray = Array.from(results);
    console.debug(`[MoneyObject] getUpdatesByIds: Found ${resultsArray.length} rows in database`);

    const updates = resultsArray.map((row, index) => {
      const rawUpdate = row.update;
      console.debug(`[MoneyObject] getUpdatesByIds: Row ${index}: rawUpdateType=${rawUpdate.constructor.name}, deviceId=${row.deviceId}`);

      // Convert ArrayBuffer back to Uint8Array
      let update: Uint8Array;
      if (rawUpdate instanceof ArrayBuffer) {
        update = new Uint8Array(rawUpdate);
        console.debug(`[MoneyObject] Converted ArrayBuffer to Uint8Array, length=${update.length}`);
      } else if (rawUpdate instanceof Uint8Array) {
        update = rawUpdate;
        console.debug(`[MoneyObject] Already Uint8Array, length=${update.length}`);
      } else {
        console.error(`[MoneyObject] Unexpected update type: ${rawUpdate.constructor.name}`);
        throw new Error(`Unexpected update type: ${rawUpdate.constructor.name}`);
      }

      return {
        update: update,
        timestamp: row.timestamp as number,
        deviceId: row.deviceId as string
      };
    });

    return updates;
  }

  // Method to check if there's any data (for sync check)
  async hasData(): Promise<boolean> {
    const results = this.storage.sql.exec('SELECT COUNT(*) as count FROM updates');
    const resultsArray = Array.from(results);
    return resultsArray.length > 0 && (resultsArray[0].count as number) > 0;
  }
}
