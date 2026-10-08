import type { BankId, BankNotificationDocument, InboxNotice } from '../../shared/bank-notifications'
import { BANK_NOTIFICATION_DAYS } from '../../shared/bank-notifications'
import { BinaryUtils } from '../utils/binary'

export interface InboxSql {
  exec(query: string, ...bindings: unknown[]): Iterable<Record<string, unknown>>
}

export interface StoredDocument {
  bank: BankId
  messageId: string
  filename: string
  content: Uint8Array
  charset?: string
  /** When the bank sent it, from the message's Date header; arrival stands in when it has none. */
  sentAt?: number
}

export type StoredNotice = Omit<InboxNotice, 'receivedAt'>

const RETENTION_MS = BANK_NOTIFICATION_DAYS * 24 * 60 * 60 * 1000

/**
 * Mail waiting for the person to open the import. Nothing stays longer than
 * the retention window, read or not.
 */
export class InboxStore {
  private sql: InboxSql

  constructor(sql: InboxSql) {
    this.sql = sql
    sql.exec(
      `CREATE TABLE IF NOT EXISTS inbox_documents (
        message_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        bank TEXT NOT NULL,
        content BLOB NOT NULL,
        charset TEXT,
        received_at INTEGER NOT NULL,
        PRIMARY KEY (message_id, filename)
      )`
    )
    sql.exec(
      `CREATE TABLE IF NOT EXISTS inbox_notices (
        message_id TEXT PRIMARY KEY,
        sender TEXT NOT NULL,
        subject TEXT NOT NULL,
        text TEXT NOT NULL,
        received_at INTEGER NOT NULL
      )`
    )
  }

  addDocuments(documents: StoredDocument[], now = Date.now()): void {
    this.prune(now)
    for (const document of documents) {
      // A message delivered twice keeps its first arrival.
      this.sql.exec(
        `INSERT OR IGNORE INTO inbox_documents (message_id, filename, bank, content, charset, received_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        document.messageId,
        document.filename,
        document.bank,
        document.content,
        document.charset ?? null,
        // A notification's date is the only time some of them carry, so it is kept, never later than arrival.
        Math.min(document.sentAt ?? now, now)
      )
    }
  }

  addNotice(notice: StoredNotice, now = Date.now()): void {
    this.prune(now)
    this.sql.exec(
      `INSERT OR IGNORE INTO inbox_notices (message_id, sender, subject, text, received_at) VALUES (?, ?, ?, ?, ?)`,
      notice.messageId,
      notice.sender,
      notice.subject,
      notice.text,
      now
    )
  }

  list(now = Date.now()): { documents: BankNotificationDocument[]; notices: InboxNotice[] } {
    this.prune(now)

    const documents = Array.from(
      this.sql.exec(
        'SELECT message_id, filename, bank, content, charset, received_at FROM inbox_documents ORDER BY received_at, message_id, filename'
      ),
      (row): BankNotificationDocument => ({
        bank: row.bank as BankId,
        messageId: row.message_id as string,
        receivedAt: new Date(row.received_at as number).toISOString(),
        filename: row.filename as string,
        content: BinaryUtils.toBase64(BinaryUtils.fromSqlBlob(row.content as SqlStorageValue, 'content')),
        ...(row.charset ? { charset: row.charset as string } : {}),
      })
    )

    const notices = Array.from(
      this.sql.exec('SELECT message_id, sender, subject, text, received_at FROM inbox_notices ORDER BY received_at'),
      (row): InboxNotice => ({
        messageId: row.message_id as string,
        receivedAt: new Date(row.received_at as number).toISOString(),
        sender: row.sender as string,
        subject: row.subject as string,
        text: row.text as string,
      })
    )

    return { documents, notices }
  }

  remove(messageIds: string[]): void {
    for (const messageId of messageIds) {
      this.sql.exec('DELETE FROM inbox_documents WHERE message_id = ?', messageId)
      this.sql.exec('DELETE FROM inbox_notices WHERE message_id = ?', messageId)
    }
  }

  private prune(now: number): void {
    const cutoff = now - RETENTION_MS
    this.sql.exec('DELETE FROM inbox_documents WHERE received_at < ?', cutoff)
    this.sql.exec('DELETE FROM inbox_notices WHERE received_at < ?', cutoff)
  }
}
