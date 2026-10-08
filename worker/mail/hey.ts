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

interface HeyAttachmentTag {
  url: string
  filename: string
  contentType: string
  content: string
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity[0] !== '#') return ENTITIES[entity.toLowerCase()] ?? whole
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
    return Number.isFinite(code) ? String.fromCodePoint(code) : whole
  })
}

/**
 * The attributes of the tag that opens at `start`. Read token by token rather
 * than up to the next '>', because a wrapper's `content` attribute holds a
 * whole email, and a '>' inside a quoted value does not end the tag.
 */
function readTagAttributes(html: string, start: number): Record<string, string> {
  const attributes: Record<string, string> = {}
  const attribute = /\s*([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/y
  let at = html.indexOf(' ', start)
  if (at === -1) return attributes

  for (;;) {
    attribute.lastIndex = at
    const match = attribute.exec(html)
    if (!match || match[0].trim() === '') break
    attributes[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '')
    at = attribute.lastIndex
  }
  return attributes
}

function* openingTags(html: string, name: string): Generator<Record<string, string>> {
  const opener = new RegExp(`<${name}\\b`, 'gi')
  for (const match of html.matchAll(opener)) {
    yield readTagAttributes(html, match.index)
  }
}

function isBlobPath(url: string): boolean {
  return url.startsWith(BLOB_PATH_PREFIX) && url.length > BLOB_PATH_PREFIX.length && !/[?#\\\s]/.test(url) && !url.includes('..')
}

/**
 * The attachment tags in a HEY message body: each file is an
 * action-text-attachment tag or a Trix figure.
 */
function attachmentTags(html: string): HeyAttachmentTag[] {
  const tags: HeyAttachmentTag[] = []

  for (const attributes of openingTags(html, 'action-text-attachment')) {
    tags.push({
      url: attributes.url ?? '',
      filename: attributes.filename ?? '',
      contentType: attributes['content-type'] ?? '',
      content: attributes.content ?? '',
    })
  }

  for (const attributes of openingTags(html, 'figure')) {
    const raw = attributes['data-trix-attachment']
    if (!raw) continue
    try {
      const trix = JSON.parse(raw) as Record<string, unknown>
      const text = (key: string) => (typeof trix[key] === 'string' ? (trix[key] as string) : '')
      tags.push({ url: text('url'), filename: text('filename'), contentType: text('contentType'), content: text('content') })
    } catch {
      continue
    }
  }

  return tags
}

/**
 * The files a HEY message body links to. An inbound email's own files sit
 * one level down, inside the escaped markup its wrapper tag carries as
 * `content`.
 */
export function extractHeyAttachments(html: string, depth = 0): HeyAttachmentRef[] {
  if (depth > MAX_EMBED_DEPTH) return []

  const found: HeyAttachmentRef[] = []
  for (const tag of attachmentTags(html)) {
    if (isBlobPath(tag.url) && tag.filename) {
      found.push({ url: tag.url, filename: tag.filename, contentType: tag.contentType })
    } else if (tag.content) {
      found.push(...extractHeyAttachments(tag.content, depth + 1))
    }
  }
  return found
}

/**
 * An inbound email's own HTML. HEY wraps it in an HTML attachment tag whose
 * `content` is the email, itself inside a <shadow-content><template> pair
 * that an HTML parser would keep out of the document's text; a body with
 * no such wrapper is returned as it is.
 */
export function unwrapHeyBody(html: string): string {
  const wrapper = attachmentTags(html).find(
    (tag) => tag.content && !tag.filename && /^text\/html\b/i.test(tag.contentType)
  )
  if (!wrapper) return html
  return wrapper.content.replace(/<\/?(?:shadow-content|template)\b[^>]*>/gi, '')
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

  async getBody(messageId: string): Promise<string> {
    return unwrapHeyBody(await this.getContent(messageId))
  }

  private async getContent(messageId: string): Promise<string> {
    const message = await this.getJson<HeyMessage>(`/messages/${encodeURIComponent(messageId)}`)
    return message.content ?? ''
  }

  async getAttachments(messageId: string, wanted: (filename: string) => boolean): Promise<MailAttachment[]> {
    const refs = extractHeyAttachments(await this.getContent(messageId)).filter((ref) => wanted(ref.filename))

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
