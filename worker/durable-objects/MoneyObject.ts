import { DurableObject } from "cloudflare:workers";

interface Update {
  update: Uint8Array;
  timestamp: number;
  deviceId: string;
  created_at?: number;
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

    this.storage = ctx.storage;
  }

  async pushUpdates(updates: Update[]): Promise<void> {
    for (const update of updates) {

      this.storage.sql.exec(
        'INSERT INTO updates ("update", timestamp, deviceId) VALUES (?, ?, ?)',
        update.update,
        update.timestamp,
        update.deviceId
      );
    }
  }

  async getUpdates(since?: number): Promise<Update[]> {
    const query = since
      ? 'SELECT "update", timestamp, deviceId, created_at FROM updates WHERE created_at > ? ORDER BY created_at'
      : 'SELECT "update", timestamp, deviceId, created_at FROM updates ORDER BY created_at';

    const params = since ? [since] : [];

    const results = this.storage.sql.exec(query, ...params);

    const resultsArray = Array.from(results);

    const mappedResults = resultsArray.map(row => ({
      update: row.update as Uint8Array,
      timestamp: row.timestamp as number,
      deviceId: row.deviceId as string,
      created_at: row.created_at as number
    }));

    return mappedResults;
  }
}
