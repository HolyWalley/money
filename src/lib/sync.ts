import Dexie, { type Table } from 'dexie';
import { ydoc as doc } from './crdts';
import * as Y from 'yjs';

interface YjsUpdate {
  id?: number;
  update: Uint8Array;
  timestamp: number;
  synced: 0 | 1;  // Dexie works better with numeric values for indexed boolean fields
  deviceId: string;
}

interface SyncUpdate {
  update: Uint8Array | number[];  // Allow both for serialization
  timestamp: number;
  deviceId: string;
  created_at?: number;
}

interface SyncMetadata {
  key: string;
  value: any;
}

const db = new Dexie('UpdatesDB') as Dexie & {
  updates: Table<YjsUpdate, number>;
  syncMetadata: Table<SyncMetadata, string>;
}

db.version(1).stores({
  updates: '++id, timestamp, synced, deviceId',
  syncMetadata: 'key'
});

export class Sync {
  private deviceId: string;
  private pushTimeout: NodeJS.Timeout | null = null;
  private readonly LAST_SYNC_KEY = 'lastSyncTimestamp';

  constructor(
    deviceId: string,
  ) {
    this.deviceId = deviceId;
    this.setupLocalListener();
  }

  private async getLastSyncTimestamp(): Promise<number> {
    try {
      const metadata = await db.syncMetadata.get(this.LAST_SYNC_KEY);
      return metadata?.value || 0;
    } catch (error) {
      console.error('Failed to load sync metadata:', error);
      return 0;
    }
  }

  private async setLastSyncTimestamp(timestamp: number): Promise<void> {
    try {
      await db.syncMetadata.put({
        key: this.LAST_SYNC_KEY,
        value: timestamp
      });
    } catch (error) {
      console.error('Failed to save sync metadata:', error);
    }
  }

  private setupLocalListener(): void {
    doc.on('update', async (update: Uint8Array, origin: any) => {
      // Skip updates that came from sync
      if (origin === 'sync') return;

      await db.updates.add({
        update: update,
        timestamp: Date.now(),
        synced: 0,
        deviceId: this.deviceId
      });

      // Debounced push to server
      this.schedulePush();
    });
  }

  private schedulePush(): void {
    if (this.pushTimeout) {
      clearTimeout(this.pushTimeout);
    }

    this.pushTimeout = setTimeout(() => {
      this.push().catch(error => {
        console.error('Failed to push updates:', error);
      });
    }, 3000);
  }

  private async push(): Promise<void> {
    try {
      // Get all unsynced updates
      const unsyncedUpdates = await db.updates
        .where('synced')
        .equals(0)
        .toArray();

      if (unsyncedUpdates.length === 0) {
        return;
      }

      // Prepare updates for server - convert Uint8Array to array for JSON serialization
      const updates: SyncUpdate[] = unsyncedUpdates.map(u => ({
        update: Array.from(u.update),
        timestamp: u.timestamp,
        deviceId: u.deviceId
      }));

      const response = await fetch('/api/v1/sync', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.statusText}`);
      }

      // Mark updates as synced
      const updateIds = unsyncedUpdates.map(u => u.id!).filter(id => id !== undefined);
      await db.updates
        .where('id')
        .anyOf(updateIds)
        .modify({ synced: 1 });

    } catch (error) {
      console.error('Push sync error:', error);
      throw error;
    }
  }

  async pull(): Promise<void> {
    try {
      const lastSyncTimestamp = await this.getLastSyncTimestamp();
      const params = lastSyncTimestamp ? `?since=${lastSyncTimestamp}` : '';
      const response = await fetch(`/api/v1/sync${params}`, {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Pull sync response error:', response.status, errorText);
        throw new Error(`Pull failed: ${response.statusText}`);
      }

      const responseText = await response.text();

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('Response text that failed to parse:', responseText);
        throw parseError;
      }
      const updates: SyncUpdate[] = data.data?.updates || [];

      if (updates.length === 0) {
        return;
      }

      // Apply updates to local Y.Doc
      updates.forEach(update => {
        // Convert array back to Uint8Array if needed
        const updateData = Array.isArray(update.update)
          ? new Uint8Array(update.update)
          : update.update;

        // Apply update with 'sync' origin to prevent re-syncing
        Y.applyUpdate(doc, updateData, 'sync');
      });

      // Update last sync timestamp using server's created_at timestamp
      const latestCreatedAt = Math.max(...updates.map(u => u.created_at || 0));
      if (latestCreatedAt > 0) {
        await this.setLastSyncTimestamp(latestCreatedAt);
      }

    } catch (error) {
      console.error('Pull sync error:', error);
      throw error;
    }
  }

  // for debugging or manual sync
  async getLocalUpdates(since?: number): Promise<YjsUpdate[]> {
    if (since) {
      return db.updates
        .where('timestamp')
        .above(since)
        .toArray();
    }
    return db.updates.toArray();
  }

  // Clear old synced updates to save space
  async pruneOldUpdates(olderThan: number): Promise<void> {
    await db.updates
      .where('synced')
      .equals(1)
      .and(update => update.timestamp < olderThan)
      .delete();
  }
}
