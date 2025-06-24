import Dexie, { type Table } from 'dexie';
import { ydoc as doc } from './crdts';
import * as Y from 'yjs';
import { apiClient } from './api-client';

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
  value: number | string;
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
  private readonly LAST_PREMIUM_SYNC_KEY = 'lastPremiumSyncTimestamp';
  private updateListener: ((update: Uint8Array, origin: string | null) => void) | null = null;

  constructor(
    deviceId: string,
  ) {
    this.deviceId = deviceId;
    this.setupLocalListener();
  }

  private async getLastSyncTimestamp(): Promise<number> {
    try {
      const metadata = await db.syncMetadata.get(this.LAST_SYNC_KEY);
      return (metadata?.value as number) || 0;
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
    this.updateListener = async (update: Uint8Array, origin: string | null) => {
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
    };

    doc.on('update', this.updateListener);
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

      const response = await apiClient.pushSync(updates);

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.error || 'Unknown error'}`);
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

  async pull(premiumActivatedAt?: string): Promise<void> {
    try {
      // Check if we need to perform initial sync (push complete state)
      if (premiumActivatedAt) {
        await this.performInitialSyncIfNeeded(premiumActivatedAt);
      }

      const lastSyncTimestamp = await this.getLastSyncTimestamp();
      const lastSyncStr = lastSyncTimestamp ? lastSyncTimestamp.toString() : undefined;
      const response = await apiClient.pullSync(lastSyncStr);

      if (!response.ok) {
        console.error('Pull sync response error:', response.status, response.error);
        throw new Error(`Pull failed: ${response.error || 'Unknown error'}`);
      }

      const updates: SyncUpdate[] = response.data?.updates || [];

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

  private async getLastPremiumSyncTimestamp(): Promise<number> {
    try {
      const metadata = await db.syncMetadata.get(this.LAST_PREMIUM_SYNC_KEY);
      return (metadata?.value as number) || 0;
    } catch (error) {
      console.error('Failed to load premium sync metadata:', error);
      return 0;
    }
  }

  private async setLastPremiumSyncTimestamp(timestamp: number): Promise<void> {
    try {
      await db.syncMetadata.put({
        key: this.LAST_PREMIUM_SYNC_KEY,
        value: timestamp
      });
    } catch (error) {
      console.error('Failed to save premium sync metadata:', error);
    }
  }

  private async performInitialSyncIfNeeded(premiumActivatedAt: string): Promise<void> {
    try {
      const premiumActivatedTimestamp = new Date(premiumActivatedAt).getTime();
      const lastPremiumSync = await this.getLastPremiumSyncTimestamp();
      
      // Check if we need to push complete state (haven't synced since premium activated)
      if (lastPremiumSync < premiumActivatedTimestamp) {
        console.log('Performing initial sync push - haven\'t synced since premium activation');
        
        // Get the complete state of the document
        const stateUpdate = Y.encodeStateAsUpdate(doc);
        
        // Only push if we have actual state to share
        if (stateUpdate.length > 0) {
          // Push complete state as a regular update
          const response = await apiClient.pushSync([{
            update: Array.from(stateUpdate),
            timestamp: Date.now(),
            deviceId: this.deviceId
          }]);

          if (!response.ok) {
            throw new Error(`Initial sync push failed: ${response.error || 'Unknown error'}`);
          }

          console.log('Initial sync push completed');
        }

        // Mark that we've synced as premium user
        await this.setLastPremiumSyncTimestamp(Date.now());
      }
      
    } catch (error) {
      console.error('Initial sync error:', error);
      // Don't throw - allow normal sync to continue
    }
  }

  // Cleanup method to remove event listeners and clear timeouts
  destroy(): void {
    // Remove event listener
    if (this.updateListener) {
      doc.off('update', this.updateListener);
      this.updateListener = null;
    }

    // Clear any pending push timeout
    if (this.pushTimeout) {
      clearTimeout(this.pushTimeout);
      this.pushTimeout = null;
    }
  }
}
