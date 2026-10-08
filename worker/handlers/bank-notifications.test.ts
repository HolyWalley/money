import { describe, it, expect, vi } from 'vitest'
import type { CloudflareEnv, UserInfo } from '../types/cloudflare'
import type { BankNotificationsResponse, InboxAddressResponse } from '../../shared/bank-notifications'
import { onRequestDelete, onRequestGet, onRequestPostAddress, onRequestPutForwarder } from './bank-notifications'

const user = { userId: 'u1', username: 'owner' } as UserInfo
const document = {
  bank: 'mbank' as const,
  messageId: '<m1@mbank.pl>',
  receivedAt: '2026-10-08T05:00:00.000Z',
  filename: 'a.htm',
  content: btoa('<html/>'),
}

function fakeEnv({
  inboxToken,
  inboxForwarder,
  domain = 'in.example.com',
}: { inboxToken?: string; inboxForwarder?: string; domain?: string | null } = {}) {
  const kv = new Map<string, string>()
  kv.set('user:owner', JSON.stringify({ userId: 'u1', username: 'owner', isActive: true, inboxToken, inboxForwarder }))
  if (inboxToken) kv.set(`inbox:${inboxToken}`, 'u1')

  const inbox = {
    listInbox: vi.fn(async () => ({ documents: [document], notices: [] })),
    removeFromInbox: vi.fn<(messageIds: string[]) => Promise<void>>(async () => {}),
  }
  const env = {
    MONEY_USER_AUTH: {
      get: vi.fn(async (key: string) => kv.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => void kv.set(key, value)),
      delete: vi.fn(async (key: string) => void kv.delete(key)),
    },
    MONEY_OBJECT: { idFromName: vi.fn((name: string) => name), get: vi.fn(() => inbox) },
    ...(domain ? { INBOX_DOMAIN: domain } : {}),
  } as unknown as CloudflareEnv
  return { env, kv, inbox }
}

async function data<T>(response: Response): Promise<T> {
  return ((await response.json()) as { data: T }).data
}

function deleteRequest(body: unknown): Request {
  return new Request('https://money.test/api/v1/bank-notifications', { method: 'DELETE', body: JSON.stringify(body) })
}

const request = new Request('https://money.test/api/v1/bank-notifications')

describe('bank-notifications handler', () => {
  describe('GET', () => {
    it("returns the person's inbox and address, uncacheable", async () => {
      const { env, inbox } = fakeEnv({ inboxToken: 'abcdefghjkmnpqrs' })

      const response = await onRequestGet(request, env, user)

      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(env.MONEY_OBJECT.idFromName).toHaveBeenCalledWith('u1')
      expect(inbox.listInbox).toHaveBeenCalled()
      expect(await data<BankNotificationsResponse>(response)).toEqual({
        documents: [document],
        notices: [],
        address: 'abcdefghjkmnpqrs@in.example.com',
        forwarder: null,
      })
    })

    it('has no address until one is created', async () => {
      const { env } = fakeEnv()

      const response = await onRequestGet(request, env, user)

      expect((await data<BankNotificationsResponse>(response)).address).toBeNull()
    })

    it('has no address while receiving mail is not set up', async () => {
      const { env } = fakeEnv({ inboxToken: 'abcdefghjkmnpqrs', domain: null })

      const response = await onRequestGet(request, env, user)

      expect((await data<BankNotificationsResponse>(response)).address).toBeNull()
    })
  })

  describe('DELETE', () => {
    it("removes the named messages from the person's inbox", async () => {
      const { env, inbox } = fakeEnv()

      const response = await onRequestDelete(deleteRequest({ messageIds: ['<m1@mbank.pl>'] }), env, user)

      expect(response.status).toBe(200)
      expect(inbox.removeFromInbox).toHaveBeenCalledWith(['<m1@mbank.pl>'])
    })

    it('refuses a body without message ids', async () => {
      const { env, inbox } = fakeEnv()

      const response = await onRequestDelete(deleteRequest({ messageIds: [] }), env, user)

      expect(response.status).toBe(422)
      expect(inbox.removeFromInbox).not.toHaveBeenCalled()
    })
  })

  describe('POST address', () => {
    it('creates an address that routes to the person', async () => {
      const { env, kv } = fakeEnv()

      const response = await onRequestPostAddress(request, env, user)

      expect(response.status).toBe(200)
      const { address } = await data<InboxAddressResponse>(response)
      const token = address.split('@')[0]
      expect(address).toMatch(/^[a-z2-9]{16}@in\.example\.com$/)
      expect(JSON.parse(kv.get(`inbox:${token}`)!)).toEqual({ userId: 'u1' })
      expect(JSON.parse(kv.get('user:owner')!).inboxToken).toBe(token)
    })

    it('carries the forwarding mailbox over to the new address', async () => {
      const { env, kv } = fakeEnv({ inboxToken: 'abcdefghjkmnpqrs', inboxForwarder: 'me@hey.com' })

      const { address } = await data<InboxAddressResponse>(await onRequestPostAddress(request, env, user))

      expect(JSON.parse(kv.get(`inbox:${address.split('@')[0]}`)!)).toEqual({ userId: 'u1', forwarder: 'me@hey.com' })
    })

    it('retires the address it replaces', async () => {
      const { env, kv } = fakeEnv({ inboxToken: 'abcdefghjkmnpqrs' })

      await onRequestPostAddress(request, env, user)

      expect(kv.has('inbox:abcdefghjkmnpqrs')).toBe(false)
    })

    it('answers 503 while receiving mail is not set up', async () => {
      const { env } = fakeEnv({ domain: null })

      const response = await onRequestPostAddress(request, env, user)

      expect(response.status).toBe(503)
    })
  })

  describe('PUT forwarder', () => {
    function putRequest(body: unknown): Request {
      return new Request('https://money.test/api/v1/bank-notifications/forwarder', { method: 'PUT', body: JSON.stringify(body) })
    }

    it('names the mailbox on the account and on its address, lowercased', async () => {
      const { env, kv } = fakeEnv({ inboxToken: 'abcdefghjkmnpqrs' })

      const response = await onRequestPutForwarder(putRequest({ forwarder: ' Me@HEY.com ' }), env, user)

      expect(await data(response)).toEqual({ forwarder: 'me@hey.com' })
      expect(JSON.parse(kv.get('user:owner')!).inboxForwarder).toBe('me@hey.com')
      expect(JSON.parse(kv.get('inbox:abcdefghjkmnpqrs')!)).toEqual({ userId: 'u1', forwarder: 'me@hey.com' })
    })

    it('stops forwarding when the mailbox is cleared', async () => {
      const { env, kv } = fakeEnv({ inboxToken: 'abcdefghjkmnpqrs', inboxForwarder: 'me@hey.com' })

      await onRequestPutForwarder(putRequest({ forwarder: null }), env, user)

      expect(JSON.parse(kv.get('user:owner')!).inboxForwarder).toBeUndefined()
      expect(JSON.parse(kv.get('inbox:abcdefghjkmnpqrs')!)).toEqual({ userId: 'u1' })
    })

    it('refuses something that is not an email address', async () => {
      const { env } = fakeEnv()

      const response = await onRequestPutForwarder(putRequest({ forwarder: 'not an address' }), env, user)

      expect(response.status).toBe(422)
    })
  })
})
