import { describe, it, expect, vi } from 'vitest'
import { HeyMailProvider, extractHeyAttachments } from './hey'
import { MailProviderError } from './types'

const BLOB = '/rails/active_storage/blobs/redirect/abc123/statement.htm'

function attachmentTag(url: string, filename: string, contentType = 'text/html'): string {
  return `<action-text-attachment url="${url}" filename="${filename}" content-type="${contentType}"></action-text-attachment>`
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('extractHeyAttachments', () => {
  it('reads an attachment tag', () => {
    expect(extractHeyAttachments(`<p>Hello</p>${attachmentTag(BLOB, 'statement.htm')}`)).toEqual([
      { url: BLOB, filename: 'statement.htm', contentType: 'text/html' },
    ])
  })

  it('reads files nested in an embedded body', () => {
    const inner = attachmentTag(BLOB, 'statement.htm')
    const outer = `<action-text-attachment content-type="text/html" content="${escapeHtml(inner)}"></action-text-attachment>`

    expect(extractHeyAttachments(outer).map((ref) => ref.filename)).toEqual(['statement.htm'])
  })

  it('reads a Trix figure', () => {
    const trix = JSON.stringify({ url: BLOB, filename: 'statement.htm', contentType: 'text/html' })
    const html = `<figure data-trix-attachment="${escapeHtml(trix)}"></figure>`

    expect(extractHeyAttachments(html)).toEqual([{ url: BLOB, filename: 'statement.htm', contentType: 'text/html' }])
  })

  it('ignores links that are not HEY blobs', () => {
    const html = [
      attachmentTag('https://evil.example/rails/active_storage/blobs/x', 'a.htm'),
      attachmentTag('/somewhere/else', 'b.htm'),
      attachmentTag(`${BLOB}?next=1`, 'c.htm'),
      attachmentTag(BLOB, ''),
    ].join('')

    expect(extractHeyAttachments(html)).toEqual([])
  })
})

describe('HeyMailProvider', () => {
  it('lists the messages a sender wrote, and only that sender', async () => {
    const fetcher = vi.fn(async () =>
      json({
        matches: [
          {
            entries: [
              { id: 1, created_at: '2026-10-05T05:50:51Z', creator: { email_address: 'Kontakt@mbank.pl' } },
              { id: 2, created_at: '2026-10-05T06:00:00Z', creator: { email_address: 'someone@example.com' } },
            ],
          },
        ],
      })
    )
    const provider = new HeyMailProvider('token', fetcher as unknown as typeof fetch)

    const messages = await provider.listMessages({ from: 'kontakt@mbank.pl', sinceDays: 7 })

    expect(messages).toEqual([{ id: '1', receivedAt: '2026-10-05T05:50:51Z' }])
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, { headers: Record<string, string> }]
    const requested = new URL(url)
    expect(requested.origin + requested.pathname).toBe('https://app.hey.com/advanced_search.json')
    expect(requested.searchParams.get('refine[from]')).toBe('kontakt@mbank.pl')
    expect(requested.searchParams.get('refine[date]')).toBe('last_7_days')
    expect(init.headers.Authorization).toBe('Bearer token')
  })

  it('downloads only the wanted attachments, without sending the token off HEY', async () => {
    const content = attachmentTag(BLOB, 'statement.htm') + attachmentTag(`${BLOB}2`, 'smime.p7s', 'application/pkcs7-signature')
    const fetcher = vi.fn(async (url: string) => {
      if (url === 'https://app.hey.com/messages/1') return json({ content })
      if (url === `https://app.hey.com${BLOB}`) {
        return new Response(null, { status: 302, headers: { Location: 'https://storage.example/signed' } })
      }
      if (url === 'https://storage.example/signed') return new Response('<html>ok</html>')
      return new Response(null, { status: 404 })
    })
    const provider = new HeyMailProvider('token', fetcher as unknown as typeof fetch)

    const attachments = await provider.getAttachments('1', (filename) => filename.endsWith('.htm'))

    expect(attachments).toHaveLength(1)
    expect(attachments[0].filename).toBe('statement.htm')
    expect(new TextDecoder().decode(attachments[0].bytes)).toBe('<html>ok</html>')

    const calls = fetcher.mock.calls as unknown as Array<[string, { headers: Record<string, string> }]>
    expect(calls.map(([url]) => url)).not.toContain(`https://app.hey.com${BLOB}2`)
    const storage = calls.find(([url]) => url === 'https://storage.example/signed')!
    expect(storage[1].headers.Authorization).toBeUndefined()
  })

  it('reports a refused token as an auth failure', async () => {
    const provider = new HeyMailProvider('token', (async () => new Response(null, { status: 401 })) as unknown as typeof fetch)

    const failure = await provider.listMessages({ from: 'kontakt@mbank.pl', sinceDays: 7 }).catch((error) => error)

    expect(failure).toBeInstanceOf(MailProviderError)
    expect((failure as MailProviderError).failure).toBe('auth')
  })

  it('reports an unreachable HEY as unavailable', async () => {
    const provider = new HeyMailProvider('token', (async () => {
      throw new Error('boom')
    }) as unknown as typeof fetch)

    const failure = await provider.listMessages({ from: 'kontakt@mbank.pl', sinceDays: 7 }).catch((error) => error)

    expect((failure as MailProviderError).failure).toBe('unavailable')
  })
})
