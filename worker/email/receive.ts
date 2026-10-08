import PostalMime, { addressParser, type Email } from 'postal-mime'
import type { BankNotificationSource } from '../../shared/bank-notifications'
import { bankNotificationSources, forwardingConfirmationSenders } from '../../shared/bank-notifications'
import type { StoredDocument } from '../lib/inbox-store'
import type { CloudflareEnv } from '../types/cloudflare'
import { InboxAddress } from './address'

export const MAX_MESSAGE_BYTES = 5 * 1024 * 1024

/** The address the From header names, lowercased; '' if it names none. */
function senderOf(header: string | null): string {
  for (const entry of addressParser(header ?? '', { flatten: true })) {
    if (entry.address) return entry.address.toLowerCase()
  }
  return ''
}

function bytesOf(content: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (typeof content === 'string') return new TextEncoder().encode(content)
  return content instanceof Uint8Array ? content : new Uint8Array(content)
}

function sentAtOf(email: Email): number | undefined {
  const sentAt = email.date ? Date.parse(email.date) : NaN
  return Number.isFinite(sentAt) ? sentAt : undefined
}

function documentsOf(email: Email, source: BankNotificationSource, messageId: string): StoredDocument[] {
  const sentAt = sentAtOf(email)
  if (source.content === 'body') {
    const body = email.html ?? email.text
    if (!body) return []
    return [{ bank: source.bank, messageId, filename: '', content: new TextEncoder().encode(body), charset: 'utf-8', sentAt }]
  }

  return email.attachments
    .filter((attachment) => attachment.filename && source.attachment.test(attachment.filename))
    .map((attachment) => ({
      bank: source.bank,
      messageId,
      filename: attachment.filename!,
      content: bytesOf(attachment.content),
      sentAt,
    }))
}

/** The bank notifications a message carries, or none if no bank sent it. */
function bankDocumentsOf(email: Email, fallbackId: string): StoredDocument[] {
  const sender = email.from?.address?.toLowerCase() ?? ''
  const source = bankNotificationSources.find((candidate) => candidate.sender === sender)
  return source ? documentsOf(email, source, email.messageId ?? fallbackId) : []
}

/**
 * The bank notifications a person's own mailbox passed on, each attached as
 * the .eml it was. The inner sender cannot be verified; the forwarder vouches
 * for it, and the person reviews every row before it is saved.
 */
async function forwardedDocumentsOf(email: Email): Promise<StoredDocument[]> {
  const documents: StoredDocument[] = []
  for (const attachment of email.attachments) {
    const isMessage = attachment.mimeType === 'message/rfc822' || /\.eml$/i.test(attachment.filename ?? '')
    if (!isMessage) continue
    const inner = await PostalMime.parse(bytesOf(attachment.content))
    documents.push(...bankDocumentsOf(inner, crypto.randomUUID()))
  }
  return documents
}

/**
 * Keeps what a bank sent to a person's address until they open the import.
 *
 * The sender is checked against the From header before the message is read:
 * Email Routing has already refused mail that fails the sender's DMARC policy,
 * so a From naming the bank is the bank. Anything else is refused unread.
 */
export async function receiveEmail(message: ForwardableEmailMessage, env: CloudflareEnv): Promise<void> {
  const token = InboxAddress.tokenOf(message.to)
  const route = token ? await InboxAddress.routeFor(token, env) : null
  if (!route) {
    message.setReject('Unknown address')
    return
  }

  const sender = senderOf(message.headers.get('from'))
  const isBank = bankNotificationSources.some((candidate) => candidate.sender === sender)
  const isForwarder = route.forwarder !== undefined && sender === route.forwarder
  const isConfirmation = forwardingConfirmationSenders.includes(sender)
  if (!isBank && !isForwarder && !isConfirmation) {
    message.setReject('This address only accepts bank notifications')
    return
  }
  if (message.rawSize > MAX_MESSAGE_BYTES) {
    message.setReject('Message too large')
    return
  }

  const email = await PostalMime.parse(message.raw, { rfc822Attachments: true })
  const messageId = email.messageId ?? crypto.randomUUID()
  const inbox = env.MONEY_OBJECT.get(env.MONEY_OBJECT.idFromName(route.userId))

  if (isConfirmation) {
    await inbox.addInboxNotice({ messageId, sender, subject: email.subject ?? '', text: email.text ?? email.html ?? '' })
    return
  }

  const documents = isBank ? bankDocumentsOf(email, messageId) : await forwardedDocumentsOf(email)
  if (documents.length > 0) await inbox.addInboxDocuments(documents)
}
