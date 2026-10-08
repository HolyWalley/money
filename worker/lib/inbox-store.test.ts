// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { InboxStore, type InboxSql } from './inbox-store'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 9, 8, 12)

/** A real SQLite that hands blobs back as ArrayBuffer, the way Durable Object storage does. */
function sqlite(): InboxSql {
  const database = new DatabaseSync(':memory:')
  return {
    exec(query: string, ...bindings: unknown[]) {
      return database.prepare(query).all(...(bindings as never[])).map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([column, value]) => [
            column,
            value instanceof Uint8Array ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) : value,
          ])
        )
      )
    },
  }
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

describe('InboxStore', () => {
  it('lists stored documents with their bytes as base64', () => {
    const store = new InboxStore(sqlite())

    store.addDocuments([{ bank: 'mbank', messageId: '<a@mbank>', filename: 'a.htm', content: bytes('<html/>') }], NOW)
    store.addDocuments(
      [{ bank: 'pko', messageId: '<b@pko>', filename: '', content: bytes('<p/>'), charset: 'utf-8' }],
      NOW + 1000
    )

    expect(store.list(NOW + 2000).documents).toEqual([
      { bank: 'mbank', messageId: '<a@mbank>', receivedAt: new Date(NOW).toISOString(), filename: 'a.htm', content: btoa('<html/>') },
      {
        bank: 'pko',
        messageId: '<b@pko>',
        receivedAt: new Date(NOW + 1000).toISOString(),
        filename: '',
        content: btoa('<p/>'),
        charset: 'utf-8',
      },
    ])
  })

  it('dates a document by when it was sent, never later than its arrival', () => {
    const store = new InboxStore(sqlite())

    store.addDocuments(
      [
        { bank: 'pko', messageId: 'sent', filename: '', content: bytes('x'), sentAt: NOW - 3 * DAY },
        { bank: 'pko', messageId: 'future', filename: '', content: bytes('x'), sentAt: NOW + DAY },
      ],
      NOW
    )

    expect(store.list(NOW).documents.map(({ messageId, receivedAt }) => ({ messageId, receivedAt }))).toEqual([
      { messageId: 'sent', receivedAt: new Date(NOW - 3 * DAY).toISOString() },
      { messageId: 'future', receivedAt: new Date(NOW).toISOString() },
    ])
  })

  it('keeps the first arrival of a message delivered twice', () => {
    const store = new InboxStore(sqlite())
    const document = { bank: 'mbank' as const, messageId: '<a@mbank>', filename: 'a.htm', content: bytes('first') }

    store.addDocuments([document], NOW)
    store.addDocuments([{ ...document, content: bytes('second') }], NOW + 1000)

    expect(store.list(NOW + 2000).documents.map((stored) => atob(stored.content))).toEqual(['first'])
  })

  it('deletes what outlived the retention window', () => {
    const store = new InboxStore(sqlite())
    store.addDocuments([{ bank: 'mbank', messageId: 'old', filename: 'a.htm', content: bytes('x') }], NOW - 8 * DAY)
    store.addNotice({ messageId: 'old-notice', sender: 's', subject: '', text: '' }, NOW - 8 * DAY)
    store.addDocuments([{ bank: 'mbank', messageId: 'new', filename: 'a.htm', content: bytes('x') }], NOW - 6 * DAY)

    const listed = store.list(NOW)

    expect(listed.documents.map((document) => document.messageId)).toEqual(['new'])
    expect(listed.notices).toEqual([])
  })

  it('lists notices', () => {
    const store = new InboxStore(sqlite())

    store.addNotice({ messageId: 'n1', sender: 'forwarding-noreply@google.com', subject: 'Confirm', text: 'Click' }, NOW)

    expect(store.list(NOW).notices).toEqual([
      {
        messageId: 'n1',
        receivedAt: new Date(NOW).toISOString(),
        sender: 'forwarding-noreply@google.com',
        subject: 'Confirm',
        text: 'Click',
      },
    ])
  })

  it('removes every part of the named messages, documents and notices alike', () => {
    const store = new InboxStore(sqlite())
    store.addDocuments(
      [
        { bank: 'mbank', messageId: 'm1', filename: 'a.htm', content: bytes('x') },
        { bank: 'mbank', messageId: 'm1', filename: 'b.htm', content: bytes('y') },
        { bank: 'mbank', messageId: 'm2', filename: 'a.htm', content: bytes('z') },
      ],
      NOW
    )
    store.addNotice({ messageId: 'n1', sender: 's', subject: '', text: '' }, NOW)

    store.remove(['m1', 'n1'])

    const listed = store.list(NOW)
    expect(listed.documents.map((document) => document.messageId)).toEqual(['m2'])
    expect(listed.notices).toEqual([])
  })
})
