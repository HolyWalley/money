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
    const insertedIds: number[] = [];

    for (const update of updates) {
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
      }
    }

    // Update compiled state with only the new updates
    if (insertedIds.length > 0) {
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
      // Get current compiled state
      const currentState = await this.getCompiledState();

      // Get the new updates that need to be applied
      const newUpdates = await this.getUpdatesByIds(newUpdateIds);

      if (newUpdates.length === 0) {
        return;
      }

      let doc: Y.Doc;

      if (currentState) {
        // Apply existing state to a new doc
        doc = new Y.Doc();
        Y.applyUpdate(doc, currentState.state);
      } else {
        // No existing state, start fresh
        doc = new Y.Doc();
      }

      // Apply only the new updates
      for (const update of newUpdates) {
        Y.applyUpdate(doc, update.update);
      }

      // Encode the updated state and store directly as BLOB
      const newCompiledState = Y.encodeStateAsUpdate(doc);

      const latestTimestamp = Math.max(...newUpdates.map(u => u.timestamp));
      const maxUpdateId = Math.max(...newUpdateIds);

      // Save or update the compiled state
      this.storage.sql.exec(
        `INSERT OR REPLACE INTO compiled_state (id, state, last_update_timestamp, last_update_id)
         VALUES (1, ?, ?, ?)`,
        newCompiledState,
        latestTimestamp,
        maxUpdateId
      );

    } catch (error) {
      console.error('[MoneyObject] Failed to update compiled state:', error);
      // Don't throw - allow normal operation to continue
    }
  }

  private async getUpdatesByIds(updateIds: number[]): Promise<Update[]> {
    if (updateIds.length === 0) {
      return [];
    }

    const placeholders = updateIds.map(() => '?').join(',');
    const results = this.storage.sql.exec(
      `SELECT "update", timestamp, deviceId FROM updates WHERE id IN (${placeholders}) ORDER BY id`,
      ...updateIds
    );

    const resultsArray = Array.from(results);

    return resultsArray.map(row => {
      const rawUpdate = row.update;
      const update = rawUpdate instanceof ArrayBuffer ? new Uint8Array(rawUpdate) : rawUpdate as Uint8Array;

      return {
        update,
        timestamp: row.timestamp as number,
        deviceId: row.deviceId as string
      };
    });
  }

  // Method to check if there's any data (for sync check)
  async hasData(): Promise<boolean> {
    const results = this.storage.sql.exec('SELECT COUNT(*) as count FROM updates');
    const resultsArray = Array.from(results);
    return resultsArray.length > 0 && (resultsArray[0].count as number) > 0;
  }

  // Method to get storage sizes for debug information
  async getStorageSizes(): Promise<{ updatesTableBytes: number; compiledStateBytes: number }> {
    // Get total size of updates table
    const updatesResult = this.storage.sql.exec(
      'SELECT IFNULL(SUM(length("update")), 0) AS total_update_bytes FROM updates'
    );
    const updatesArray = Array.from(updatesResult);
    const updatesTableBytes = updatesArray.length > 0
      ? (updatesArray[0].total_update_bytes as number)
      : 0;

    // Get size of compiled state
    const stateResult = this.storage.sql.exec(
      'SELECT IFNULL(length(state), 0) AS compiled_state_bytes FROM compiled_state WHERE id = 1'
    );
    const stateArray = Array.from(stateResult);
    const compiledStateBytes = stateArray.length > 0
      ? (stateArray[0].compiled_state_bytes as number)
      : 0;

    return {
      updatesTableBytes,
      compiledStateBytes
    };
  }

  // Method to get update statistics for debugging
  async getUpdateStatistics(): Promise<{
    count: number;
    totalBytes: number;
    minSize: number;
    maxSize: number;
    avgSize: number;
    medianSize: number;
    distribution: { range: string; count: number }[];
  }> {
    // Get all update sizes
    const result = this.storage.sql.exec(
      'SELECT length("update") as size FROM updates ORDER BY size'
    );
    const rows = Array.from(result);

    if (rows.length === 0) {
      return {
        count: 0,
        totalBytes: 0,
        minSize: 0,
        maxSize: 0,
        avgSize: 0,
        medianSize: 0,
        distribution: []
      };
    }

    const sizes = rows.map(row => row.size as number);
    const count = sizes.length;
    const totalBytes = sizes.reduce((sum, size) => sum + size, 0);
    const minSize = sizes[0];
    const maxSize = sizes[count - 1];
    const avgSize = Math.round(totalBytes / count);

    // Calculate median
    let medianSize: number;
    if (count % 2 === 0) {
      medianSize = Math.round((sizes[count / 2 - 1] + sizes[count / 2]) / 2);
    } else {
      medianSize = sizes[Math.floor(count / 2)];
    }

    // Create distribution buckets
    const distribution: { range: string; count: number }[] = [];
    const buckets = [
      { range: '0-1KB', min: 0, max: 1024 },
      { range: '1-10KB', min: 1024, max: 10240 },
      { range: '10-100KB', min: 10240, max: 102400 },
      { range: '100KB-1MB', min: 102400, max: 1048576 },
      { range: '>1MB', min: 1048576, max: Infinity }
    ];

    for (const bucket of buckets) {
      const count = sizes.filter(size => size >= bucket.min && size < bucket.max).length;
      if (count > 0) {
        distribution.push({ range: bucket.range, count });
      }
    }

    return {
      count,
      totalBytes,
      minSize,
      maxSize,
      avgSize,
      medianSize,
      distribution
    };
  }

  // Get database dump chunk by chunk
  async getDatabaseDumpChunk(chunkIndex: number): Promise<{ chunk: string; hasMore: boolean }> {
    const batchSize = 20;
    const lines: string[] = [];
    
    // First chunk includes metadata
    if (chunkIndex === 0) {
      lines.push(JSON.stringify({
        type: 'metadata',
        version: 1,
        timestamp: Date.now()
      }));
    }
    
    // Calculate offset for updates
    const offset = chunkIndex * batchSize;
    
    // Get updates for this chunk
    const results = this.storage.sql.exec(
      'SELECT id, "update", timestamp, deviceId, created_at FROM updates ORDER BY id LIMIT ? OFFSET ?',
      batchSize,
      offset
    );
    
    const rows = Array.from(results);
    
    for (const row of rows) {
      const rawUpdate = row.update;
      const update = rawUpdate instanceof ArrayBuffer ? new Uint8Array(rawUpdate) : rawUpdate as Uint8Array;
      
      lines.push(JSON.stringify({
        type: 'update',
        id: row.id,
        update: Array.from(update), // Convert Uint8Array to regular array for JSON
        timestamp: row.timestamp,
        deviceId: row.deviceId,
        created_at: row.created_at
      }));
    }
    
    // Check if we need to add compiled state and end marker
    const hasMoreUpdates = rows.length === batchSize;
    
    if (!hasMoreUpdates) {
      // This is the last chunk, add compiled state if exists
      const compiledState = await this.getCompiledState();
      if (compiledState) {
        lines.push(JSON.stringify({
          type: 'compiled_state',
          state: Array.from(compiledState.state),
          last_update_timestamp: compiledState.last_update_timestamp,
          last_update_id: compiledState.last_update_id,
          created_at: compiledState.created_at
        }));
      }
      
      // Add end marker
      lines.push(JSON.stringify({
        type: 'end',
        timestamp: Date.now()
      }));
    }
    
    return {
      chunk: lines.join('\n') + (lines.length > 0 ? '\n' : ''),
      hasMore: hasMoreUpdates
    };
  }

  // Start a new import session
  async startImport(): Promise<void> {
    // Clear existing data
    this.storage.sql.exec('DELETE FROM updates');
    this.storage.sql.exec('DELETE FROM compiled_state');
    
    // Reset import counters
    await this.storage.put('import:updatesCount', 0);
    await this.storage.put('import:hasCompiledState', false);
  }

  // Import a chunk of dump data
  async importDatabaseChunk(dumpLines: string[]): Promise<void> {
    let updatesImported = 0;
    
    for (const line of dumpLines) {
      if (!line.trim()) continue;
      
      try {
        const data = JSON.parse(line);
        
        switch (data.type) {
          case 'update': {
            // Convert array back to Uint8Array
            const updateBytes = new Uint8Array(data.update);
            this.storage.sql.exec(
              'INSERT INTO updates (id, "update", timestamp, deviceId, created_at) VALUES (?, ?, ?, ?, ?)',
              data.id,
              updateBytes,
              data.timestamp,
              data.deviceId,
              data.created_at
            );
            updatesImported++;
            break;
          }
            
          case 'compiled_state': {
            const stateBytes = new Uint8Array(data.state);
            this.storage.sql.exec(
              'INSERT INTO compiled_state (id, state, last_update_timestamp, last_update_id, created_at) VALUES (1, ?, ?, ?, ?)',
              stateBytes,
              data.last_update_timestamp,
              data.last_update_id,
              data.created_at
            );
            await this.storage.put('import:hasCompiledState', true);
            break;
          }
        }
      } catch (error) {
        console.error('Error parsing dump line:', error);
        // Continue with next line
      }
    }
    
    // Update counters
    if (updatesImported > 0) {
      const currentCount = (await this.storage.get<number>('import:updatesCount')) || 0;
      await this.storage.put('import:updatesCount', currentCount + updatesImported);
    }
  }

  // Finish import and get results
  async finishImport(): Promise<{ updatesImported: number; hasCompiledState: boolean }> {
    const updatesImported = (await this.storage.get<number>('import:updatesCount')) || 0;
    const hasCompiledState = (await this.storage.get<boolean>('import:hasCompiledState')) || false;

    // Clean up temporary storage
    await this.storage.delete('import:updatesCount');
    await this.storage.delete('import:hasCompiledState');

    return { updatesImported, hasCompiledState };
  }

  // Clean up old updates - keep only compiled state
  async cleanupOldUpdates(): Promise<{ deletedCount: number; remainingBytes: number }> {
    console.log('[MoneyObject] Starting cleanup of old updates');

    // Get count before deletion
    const countResult = this.storage.sql.exec('SELECT COUNT(*) as count FROM updates');
    const countArray = Array.from(countResult);
    const deletedCount = countArray.length > 0 ? (countArray[0].count as number) : 0;

    // Delete all updates (compiled state contains everything)
    this.storage.sql.exec('DELETE FROM updates');

    console.log(`[MoneyObject] Deleted ${deletedCount} old updates`);

    // Get remaining storage size
    const stateResult = this.storage.sql.exec(
      'SELECT IFNULL(length(state), 0) AS compiled_state_bytes FROM compiled_state WHERE id = 1'
    );
    const stateArray = Array.from(stateResult);
    const remainingBytes = stateArray.length > 0
      ? (stateArray[0].compiled_state_bytes as number)
      : 0;

    console.log(`[MoneyObject] Remaining storage: ${remainingBytes} bytes (${(remainingBytes / 1024).toFixed(2)} KB)`);

    return { deletedCount, remainingBytes };
  }
}
