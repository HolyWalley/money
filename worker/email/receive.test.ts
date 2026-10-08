import { describe, expect, it, vi } from 'vitest'
import type { CloudflareEnv } from '../types/cloudflare'
import type { StoredDocument, StoredNotice } from '../lib/inbox-store'
import { MAX_MESSAGE_BYTES, receiveEmail } from './receive'

const TOKEN = 'abcdefghjkmnpqrs'
const ADDRESS = `${TOKEN}@in.example.com`

function fakeEnv(route: unknown = 'user-1') {
  const inbox = {
    addInboxDocuments: vi.fn<(documents: StoredDocument[]) => Promise<void>>(async () => {}),
    addInboxNotice: vi.fn<(notice: StoredNotice) => Promise<void>>(async () => {}),
  }
  const env = {
    MONEY_USER_AUTH: {
      get: vi.fn(async (key: string) =>
        key === `inbox:${TOKEN}` ? (typeof route === 'string' ? route : JSON.stringify(route)) : null
      ),
    },
    MONEY_OBJECT: {
      idFromName: vi.fn((name: string) => name),
      get: vi.fn(() => inbox),
    },
  } as unknown as CloudflareEnv
  return { env, inbox }
}

function fakeMessage(raw: string, { to = ADDRESS, rawSize = raw.length } = {}) {
  const from = raw.match(/^From: (.*)$/m)?.[1] ?? ''
  return {
    from: 'bounce@example.com',
    to,
    headers: new Headers({ from }),
    raw: new Response(raw).body!,
    rawSize,
    setReject: vi.fn(),
    forward: vi.fn(),
    reply: vi.fn(),
  } satisfies ForwardableEmailMessage
}

const MBANK = [
  'From: mBank <kontakt@mbank.pl>',
  `To: ${ADDRESS}`,
  'Subject: Powiadomienie',
  'Message-ID: <m1@mbank.pl>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="b"',
  '',
  '--b',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'W zalaczniku powiadomienie.',
  '--b',
  'Content-Type: text/html; name="Powiadomienie.htm"',
  'Content-Disposition: attachment; filename="Powiadomienie.htm"',
  'Content-Transfer-Encoding: base64',
  '',
  btoa('<html>operacje</html>'),
  '--b',
  'Content-Type: application/pkcs7-signature; name="smime.p7s"',
  'Content-Disposition: attachment; filename="smime.p7s"',
  'Content-Transfer-Encoding: base64',
  '',
  btoa('sig'),
  '--b--',
  '',
].join('\r\n')

const PKO = [
  'From: PKO BP <powiadomienia@pkobp.pl>',
  `To: ${ADDRESS}`,
  'Subject: Powiadomienie',
  'Message-ID: <p1@pkobp.pl>',
  'Date: Thu, 08 Oct 2026 04:33:09 +0000',
  'MIME-Version: 1.0',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<p>Obciążenie konta</p>',
  '',
].join('\r\n')

const GMAIL_CONFIRMATION = [
  'From: Gmail Team <forwarding-noreply@google.com>',
  `To: ${ADDRESS}`,
  'Subject: Gmail Forwarding Confirmation',
  'Message-ID: <g1@google.com>',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Confirmation code: 123456',
  '',
].join('\r\n')

function forwarded(...messages: string[]): string {
  return [
    'From: Me <me@hey.com>',
    `To: ${ADDRESS}`,
    'Subject: Bank notifications',
    'Message-ID: <f1@hey.com>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="outer"',
    '',
    '--outer',
    'Content-Type: text/plain',
    '',
    'Forwarded.',
    ...messages.flatMap((message, index) => [
      '--outer',
      `Content-Type: message/rfc822; name="notification-${index}.eml"`,
      `Content-Disposition: attachment; filename="notification-${index}.eml"`,
      '',
      message,
    ]),
    '--outer--',
    '',
  ].join('\r\n')
}

function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

describe('receiveEmail', () => {
  it("keeps a bank's attachment in the owner's inbox, and nothing else from the message", async () => {
    const { env, inbox } = fakeEnv()
    const message = fakeMessage(MBANK)

    await receiveEmail(message, env)

    expect(message.setReject).not.toHaveBeenCalled()
    expect(env.MONEY_OBJECT.idFromName).toHaveBeenCalledWith('user-1')
    const [documents] = inbox.addInboxDocuments.mock.calls[0]
    expect(documents.map(({ content, ...rest }) => ({ ...rest, content: text(content) }))).toEqual([
      { bank: 'mbank', messageId: '<m1@mbank.pl>', filename: 'Powiadomienie.htm', content: '<html>operacje</html>' },
    ])
  })

  it("keeps a bank's message body as UTF-8", async () => {
    const { env, inbox } = fakeEnv()

    await receiveEmail(fakeMessage(PKO), env)

    const [documents] = inbox.addInboxDocuments.mock.calls[0]
    expect(documents).toHaveLength(1)
    expect(documents[0]).toMatchObject({
      bank: 'pko',
      messageId: '<p1@pkobp.pl>',
      filename: '',
      charset: 'utf-8',
      sentAt: Date.UTC(2026, 9, 8, 4, 33, 9),
    })
    expect(text(documents[0].content).trim()).toBe('<p>Obciążenie konta</p>')
  })

  it('keeps a forwarding confirmation as a notice for the person', async () => {
    const { env, inbox } = fakeEnv()

    await receiveEmail(fakeMessage(GMAIL_CONFIRMATION), env)

    expect(inbox.addInboxNotice).toHaveBeenCalledWith({
      messageId: '<g1@google.com>',
      sender: 'forwarding-noreply@google.com',
      subject: 'Gmail Forwarding Confirmation',
      text: expect.stringContaining('Confirmation code: 123456'),
    })
    expect(inbox.addInboxDocuments).not.toHaveBeenCalled()
  })

  it('refuses mail to an address nobody holds', async () => {
    const { env, inbox } = fakeEnv()
    const message = fakeMessage(MBANK, { to: 'zzzzzzzzzzzzzzzz@in.example.com' })

    await receiveEmail(message, env)

    expect(message.setReject).toHaveBeenCalledWith('Unknown address')
    expect(inbox.addInboxDocuments).not.toHaveBeenCalled()
  })

  it('refuses mail from anyone but the banks', async () => {
    const { env, inbox } = fakeEnv()
    const message = fakeMessage(PKO.replace('powiadomienia@pkobp.pl', 'someone@example.com'))

    await receiveEmail(message, env)

    expect(message.setReject).toHaveBeenCalledWith('This address only accepts bank notifications')
    expect(inbox.addInboxDocuments).not.toHaveBeenCalled()
  })

  it('refuses a message too large to be a notification', async () => {
    const { env, inbox } = fakeEnv()
    const message = fakeMessage(PKO, { rawSize: MAX_MESSAGE_BYTES + 1 })

    await receiveEmail(message, env)

    expect(message.setReject).toHaveBeenCalledWith('Message too large')
    expect(inbox.addInboxDocuments).not.toHaveBeenCalled()
  })

  it('stores nothing when a bank message carries no notification', async () => {
    const { env, inbox } = fakeEnv()
    const withoutAttachment = MBANK.replace(/filename="Powiadomienie\.htm"/g, 'filename="regulamin.pdf"')

    await receiveEmail(fakeMessage(withoutAttachment), env)

    expect(inbox.addInboxDocuments).not.toHaveBeenCalled()
  })

  describe('from the forwarding mailbox', () => {
    const route = { userId: 'user-1', forwarder: 'me@hey.com' }

    it('keeps the bank notifications attached as .eml files', async () => {
      const { env, inbox } = fakeEnv(route)
      const message = fakeMessage(forwarded(MBANK, PKO))

      await receiveEmail(message, env)

      expect(message.setReject).not.toHaveBeenCalled()
      const [documents] = inbox.addInboxDocuments.mock.calls[0]
      expect(documents.map(({ bank, messageId, filename }) => ({ bank, messageId, filename }))).toEqual([
        { bank: 'mbank', messageId: '<m1@mbank.pl>', filename: 'Powiadomienie.htm' },
        { bank: 'pko', messageId: '<p1@pkobp.pl>', filename: '' },
      ])
    })

    it('reads an attached .eml whatever type the mailbox gave it', async () => {
      const { env, inbox } = fakeEnv(route)
      const raw = forwarded(PKO).replace('Content-Type: message/rfc822;', 'Content-Type: application/octet-stream;')
        .replace(/\r\n\r\n(From: PKO[\s\S]*?)\r\n--outer--/, (_whole, inner: string) =>
          `\r\nContent-Transfer-Encoding: base64\r\n\r\n${btoa(unescape(encodeURIComponent(inner)))}\r\n--outer--`)

      await receiveEmail(fakeMessage(raw), env)

      const [documents] = inbox.addInboxDocuments.mock.calls[0]
      expect(documents.map((document) => document.bank)).toEqual(['pko'])
    })

    it('ignores attached mail no bank sent', async () => {
      const { env, inbox } = fakeEnv(route)

      await receiveEmail(fakeMessage(forwarded(PKO.replace('powiadomienia@pkobp.pl', 'someone@example.com'))), env)

      expect(inbox.addInboxDocuments).not.toHaveBeenCalled()
    })

    it('refuses the same mailbox while it is not the named forwarder', async () => {
      const { env, inbox } = fakeEnv('user-1')
      const message = fakeMessage(forwarded(MBANK))

      await receiveEmail(message, env)

      expect(message.setReject).toHaveBeenCalledWith('This address only accepts bank notifications')
      expect(inbox.addInboxDocuments).not.toHaveBeenCalled()
    })
  })
})
