const MAX_EMBED_DEPTH = 4

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
 * than up to the next '>', because a wrapper's attribute holds a whole email,
 * and a '>' inside a quoted value does not end the tag.
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

interface EmbeddedHtml {
  filename: string
  contentType: string
  content: string
}

/** The HTML attachments HEY embeds in a body: action-text-attachment tags and Trix figures. */
function embeddedHtml(html: string): EmbeddedHtml[] {
  const found: EmbeddedHtml[] = []

  for (const match of html.matchAll(/<action-text-attachment\b/gi)) {
    const attributes = readTagAttributes(html, match.index)
    found.push({
      filename: attributes.filename ?? '',
      contentType: attributes['content-type'] ?? '',
      content: attributes.content ?? '',
    })
  }

  for (const match of html.matchAll(/<figure\b/gi)) {
    const raw = readTagAttributes(html, match.index)['data-trix-attachment']
    if (!raw) continue
    try {
      const trix = JSON.parse(raw) as Record<string, unknown>
      const text = (key: string) => (typeof trix[key] === 'string' ? (trix[key] as string) : '')
      found.push({ filename: text('filename'), contentType: text('contentType'), content: text('content') })
    } catch {
      continue
    }
  }

  return found
}

/**
 * An inbound email's own HTML. HEY wraps it in an HTML attachment whose
 * content is the email, inside a <shadow-content><template> pair; a body
 * with no such wrapper is returned as it is.
 */
export function unwrapHeyBody(html: string, depth = 0): string {
  if (depth > MAX_EMBED_DEPTH) return html
  const wrapper = embeddedHtml(html).find(
    (embedded) => embedded.content && !embedded.filename && /^text\/html\b/i.test(embedded.contentType)
  )
  if (!wrapper) return html
  return wrapper.content.replace(/<\/?(?:shadow-content|template)\b[^>]*>/gi, '')
}

/**
 * The body of one entry in the page `hey thread read --html` prints, with
 * HEY's From/To header rows left out, or null if the thread has no such entry.
 */
export function entryBodyHtml(threadHtml: string, entryId: number): string | null {
  const opening = new RegExp(`<article\\b[^>]*\\bdata-entry-id="${entryId}"[^>]*>`, 'i').exec(threadHtml)
  if (!opening) return null
  const start = opening.index + opening[0].length
  const end = threadHtml.indexOf('</article>', start)
  const inner = threadHtml.slice(start, end === -1 ? undefined : end)
  return unwrapHeyBody(inner.replace(/<header\b[\s\S]*?<\/header>/i, '').trim())
}

function base64Lines(bytes: Uint8Array): string {
  return (Buffer.from(bytes).toString('base64').match(/.{1,76}/g) ?? []).join('\r\n')
}

export interface NotificationEml {
  sender: string
  subject: string
  /** Stable for one notification, so a second delivery of it is recognised. */
  messageId: string
  date: Date
  /** The bank's own document: an attached file, or the HTML body. */
  attachment?: { filename: string; contentType: string; bytes: Uint8Array }
  html?: string
}

function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?utf-8?B?${Buffer.from(value).toString('base64')}?=`
}

/** The notification rebuilt as an email from the bank, ready to be attached as an .eml. */
export function buildEml(notification: NotificationEml): string {
  const headers = [
    `From: <${notification.sender}>`,
    `Subject: ${encodeHeader(notification.subject)}`,
    `Date: ${notification.date.toUTCString()}`,
    `Message-ID: ${notification.messageId}`,
    'MIME-Version: 1.0',
  ]

  if (notification.attachment) {
    const { filename, contentType, bytes } = notification.attachment
    const boundary = `money-${notification.messageId.replace(/[^\w]/g, '')}`
    return [
      ...headers,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      `Content-Type: ${contentType}; name="${encodeHeader(filename)}"`,
      `Content-Disposition: attachment; filename="${encodeHeader(filename)}"`,
      'Content-Transfer-Encoding: base64',
      '',
      base64Lines(bytes),
      `--${boundary}--`,
      '',
    ].join('\r\n')
  }

  return [
    ...headers,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(new TextEncoder().encode(notification.html ?? '')),
    '',
  ].join('\r\n')
}
