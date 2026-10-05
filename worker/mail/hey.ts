import type { MailAttachment, MailMessageRef, MailProvider, MailSearchDays } from './types'
import { MailProviderError } from './types'

const HEY_ORIGIN = 'https://app.hey.com'
const BLOB_PATH_PREFIX = '/rails/active_storage/blobs/'
const MAX_REDIRECTS = 5
const MAX_EMBED_DEPTH = 4

interface HeyEntry {
  id?: number
  created_at?: string
  creator?: { email_address?: string }
}

interface HeySearchResult {
  matches?: Array<{ entries?: HeyEntry[] }>
}

interface HeyMessage {
  content?: string
}

export interface HeyAttachmentRef {
  url: string
  filename: string
  contentType: string
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity[0] !== '#') return ENTITIES[entity.toLowerCase()] ?? whole
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
    return Number.isFinite(code) ? String.fromCodePoint(code) : whole
  })
}

function readAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const match of tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attributes[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? '')
  }
  return attributes
}

function isBlobPath(url: string): boolean {
  return url.startsWith(BLOB_PATH_PREFIX) && url.length > BLOB_PATH_PREFIX.length && !/[?#\\\s]/.test(url) && !url.includes('..')
}

/**
 * The files a HEY message body links to.
 *
 * HEY serves a message as HTML in which each file is an action-text-attachment
 * tag or a Trix figure, and an inbound email's own files sit one level down,
 * inside the escaped markup such a tag carries as `content`.
 */
export function extractHeyAttachments(html: string, depth = 0): HeyAttachmentRef[] {
  if (depth > MAX_EMBED_DEPTH) return []

  const found: HeyAttachmentRef[] = []
  const collect = (url: string, filename: string, contentType: string, content: string) => {
    if (isBlobPath(url) && filename) {
      found.push({ url, filename, contentType })
    } else if (content) {
      found.push(...extractHeyAttachments(content, depth + 1))
    }
  }

  for (const [tag] of html.matchAll(/<action-text-attachment\b[^>]*>/gi)) {
    const attributes = readAttributes(tag)
    collect(attributes.url ?? '', attributes.filename ?? '', attributes['content-type'] ?? '', attributes.content ?? '')
  }

  for (const [tag] of html.matchAll(/<figure\b[^>]*>/gi)) {
    const raw = readAttributes(tag)['data-trix-attachment']
    if (!raw) continue
    try {
      const trix = JSON.parse(raw) as Record<string, unknown>
      const text = (key: string) => (typeof trix[key] === 'string' ? (trix[key] as string) : '')
      collect(text('url'), text('filename'), text('contentType'), text('content'))
    } catch {
      continue
    }
  }

  return found
}

export class HeyMailProvider implements MailProvider {
  private token: string
  private fetcher: typeof fetch

  // Wrapped, not stored bare: workerd rejects fetch called as a method of another object.
  constructor(token: string, fetcher: typeof fetch = (input, init) => fetch(input, init)) {
    this.token = token
    this.fetcher = fetcher
  }

  async listMessages({ from, sinceDays }: { from: string; sinceDays: MailSearchDays }): Promise<MailMessageRef[]> {
    const params = new URLSearchParams({ 'refine[from]': from, 'refine[date]': `last_${sinceDays}_days` })
    const result = await this.getJson<HeySearchResult>(`/advanced_search.json?${params.toString()}`)

    const messages: MailMessageRef[] = []
    for (const match of result.matches ?? []) {
      for (const entry of match.entries ?? []) {
        // Search is fuzzy about who "from" is; the sender is checked again here.
        if (entry.id === undefined || entry.creator?.email_address?.toLowerCase() !== from.toLowerCase()) continue
        messages.push({ id: String(entry.id), receivedAt: entry.created_at ?? '' })
      }
    }
    return messages
  }

  async getAttachments(messageId: string, wanted: (filename: string) => boolean): Promise<MailAttachment[]> {
    const message = await this.getJson<HeyMessage>(`/messages/${encodeURIComponent(messageId)}`)
    const refs = extractHeyAttachments(message.content ?? '').filter((ref) => wanted(ref.filename))

    return Promise.all(
      refs.map(async (ref) => {
        const response = await this.request(ref.url, '*/*')
        return {
          filename: ref.filename,
          contentType: ref.contentType,
          bytes: new Uint8Array(await response.arrayBuffer()),
        }
      })
    )
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await this.request(path, 'application/json')
    try {
      return (await response.json()) as T
    } catch {
      throw new MailProviderError('unavailable', 'HEY answered with something that is not JSON')
    }
  }

  /**
   * Redirects are followed by hand: a blob answers with a redirect to signed
   * storage on another origin, and the token must not travel there with it.
   */
  private async request(path: string, accept: string): Promise<Response> {
    let url = new URL(path, HEY_ORIGIN)

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const headers: Record<string, string> = { Accept: accept }
      if (url.origin === HEY_ORIGIN) headers.Authorization = `Bearer ${this.token}`

      let response: Response
      try {
        response = await this.fetcher(url.toString(), { headers, redirect: 'manual' })
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown error'
        throw new MailProviderError('unavailable', `HEY could not be reached: ${reason}`)
      }

      const location = response.headers.get('Location')
      if (response.status >= 300 && response.status < 400 && location) {
        url = new URL(location, url)
        continue
      }
      if (response.status === 401 || response.status === 403) {
        throw new MailProviderError('auth', 'HEY refused the token')
      }
      if (!response.ok) {
        throw new MailProviderError('unavailable', `HEY answered ${response.status}`)
      }
      return response
    }

    throw new MailProviderError('unavailable', 'HEY redirected too many times')
  }
}
