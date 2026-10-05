import { describe, it, expect, vi } from 'vitest'
import type { CloudflareEnv, UserInfo } from '../types/cloudflare'
import type { BankNotificationsResponse } from '../../shared/bank-notifications'
import type { MailProvider } from '../mail'
import { MailProviderError } from '../mail'
import { onRequestGet } from './bank-notifications'

const request = new Request('https://money.test/api/v1/bank-notifications')
const owner = { userId: 'u1', username: 'owner' } as UserInfo
const env = { BANK_IMPORT_USERNAME: 'owner' } as CloudflareEnv

function fakeProvider(overrides: Partial<MailProvider> = {}): MailProvider {
  return {
    listMessages: vi.fn(async () => [{ id: '1', receivedAt: '2026-10-05T05:50:51Z' }]),
    getAttachments: vi.fn(async (_id: string, wanted: (filename: string) => boolean) =>
      [
        { filename: 'Powiadomienie e-mail z 2026-10-04.htm', contentType: 'text/html', bytes: new TextEncoder().encode('<html/>') },
        { filename: 'smime.p7s', contentType: 'application/pkcs7-signature', bytes: new Uint8Array([1]) },
      ].filter((attachment) => wanted(attachment.filename))
    ),
    ...overrides,
  }
}

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

describe('bank-notifications handler', () => {
  it('refuses anyone but the mailbox owner', async () => {
    const provider = fakeProvider()

    const response = await onRequestGet(request, env, { ...owner, username: 'someone-else' }, provider)

    expect(response.status).toBe(403)
    expect(provider.listMessages).not.toHaveBeenCalled()
  })

  it('recognises the owner whatever the case of the username', async () => {
    const response = await onRequestGet(request, env, { ...owner, username: 'Owner' }, fakeProvider())

    expect(response.status).toBe(200)
  })

  it('refuses everyone while no owner is configured', async () => {
    const response = await onRequestGet(request, {} as CloudflareEnv, owner, fakeProvider())

    expect(response.status).toBe(403)
  })

  it('answers 503 without a mail provider', async () => {
    const response = await onRequestGet(request, env, owner, null)

    expect(response.status).toBe(503)
  })

  it('returns the bank attachments, base64, and marks the answer uncacheable', async () => {
    const provider = fakeProvider()

    const response = await onRequestGet(request, env, owner, provider)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const { data } = await body<{ data: BankNotificationsResponse }>(response)
    expect(data.documents).toEqual([
      {
        bank: 'mbank',
        messageId: '1',
        receivedAt: '2026-10-05T05:50:51Z',
        filename: 'Powiadomienie e-mail z 2026-10-04.htm',
        content: btoa('<html/>'),
      },
    ])
    expect(provider.listMessages).toHaveBeenCalledWith({ from: 'kontakt@mbank.pl', sinceDays: 7 })
  })

  it('says the token has expired when the provider refuses it', async () => {
    const provider = fakeProvider({
      listMessages: vi.fn(async () => {
        throw new MailProviderError('auth', 'refused')
      }),
    })

    const response = await onRequestGet(request, env, owner, provider)

    expect(response.status).toBe(503)
    expect((await body<{ error: string }>(response)).error).toBe('The mail provider token has expired')
  })
})
