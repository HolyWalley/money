import Dexie, { type Table } from 'dexie';
import { ydoc as doc } from './crdts';

interface YjsUpdate {
  id?: number;
  update: Uint8Array;
  timestamp: number;
  synced: boolean;
  deviceId: string;
}

const db = new Dexie('UpdatesDB') as Dexie & {
  updates: Table<YjsUpdate, number>;
}

db.version(1).stores({
  updates: '++id, timestamp, synced, deviceId',
  syncMetadata: 'docId'
});

export class Sync {
  private deviceId: string;

  constructor(
    deviceId: string,
  ) {
    this.deviceId = deviceId;

    this.setupLocalListener();
  }

  private setupLocalListener(): void {
    doc.on('update', async (update: Uint8Array, origin: any) => {
      // Skip updates that came from sync
      if (origin === 'sync') return;

      // Store update locally
      await db.updates.add({
        update: update,
        timestamp: Date.now(),
        synced: false,
        deviceId: this.deviceId
      });
    });
  }

  // for debugging or manual sync
  async getLocalUpdates(since?: number): Promise<YjsUpdate[]> {
    // TODO: Use since to filter updates
    return db.updates.toArray();
  }

  // Clear old synced updates to save space
  async pruneOldUpdates(olderThan: number): Promise<void> {
    await db.updates
      .where(update => update.synced && update.timestamp < olderThan)
      .delete();
  }
}
