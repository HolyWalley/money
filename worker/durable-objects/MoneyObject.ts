import { DurableObject } from "cloudflare:workers";

interface Update {
  update: Uint8Array;
  timestamp: number;
  deviceId: string;
}

export class MoneyObject extends DurableObject {
  private storage: DurableObjectState['storage'];

  constructor(ctx: DurableObjectState, env: Env) {
    this.storage = ctx.storage;

    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        update BLOB NOT NULL,
        timestamp INTEGER NOT NULL,
        deviceId TEXT NOT NULL;`
    )

    super(ctx, env);
  }

  async pushUpdates(updates: Update[]): Promise<string> {
    return this.storage.sql.transaction(async (tx) => {
      const stmt = tx.prepare('INSERT INTO updates (update, timestamp, deviceId) VALUES (?, ?, ?)');
      for (const update of updates) {
        stmt.run(update.update, update.timestamp, update.deviceId);
      }
      stmt.finalize();
    })
  }
}
