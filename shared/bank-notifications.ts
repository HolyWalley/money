export type BankId = 'mbank' | 'pko'

export type BankNotificationSource =
  | { bank: BankId; sender: string; content: 'attachment'; attachment: RegExp }
  | { bank: BankId; sender: string; content: 'body' }

/**
 * The only mail the worker is allowed to read: the mail provider's token opens
 * the whole mailbox, so what is fetched is fixed here rather than taken from
 * the request.
 */
export const bankNotificationSources: readonly BankNotificationSource[] = [
  { bank: 'mbank', sender: 'kontakt@mbank.pl', content: 'attachment', attachment: /\.html?$/i },
  { bank: 'pko', sender: 'powiadomienia@pkobp.pl', content: 'body' },
]

export const BANK_NOTIFICATION_DAYS = 7

export interface BankNotificationDocument {
  bank: BankId
  messageId: string
  receivedAt: string
  /** Empty for a message body. */
  filename: string
  /** The document's bytes, base64. */
  content: string
  /** How `content` is encoded; left out when the document itself declares it. */
  charset?: string
}

export interface BankNotificationsResponse {
  documents: BankNotificationDocument[]
}
