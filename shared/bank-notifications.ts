export type BankId = 'mbank'

export interface BankNotificationSource {
  bank: BankId
  sender: string
  attachment: RegExp
}

/**
 * The only mail the worker is allowed to read: the mail provider's token opens
 * the whole mailbox, so what is fetched is fixed here rather than taken from
 * the request.
 */
export const bankNotificationSources: readonly BankNotificationSource[] = [
  { bank: 'mbank', sender: 'kontakt@mbank.pl', attachment: /\.html?$/i },
]

export const BANK_NOTIFICATION_DAYS = 7

export interface BankNotificationDocument {
  bank: BankId
  messageId: string
  receivedAt: string
  filename: string
  /** The attachment's bytes, base64: its charset is the bank's, and is read where it is parsed. */
  content: string
}

export interface BankNotificationsResponse {
  documents: BankNotificationDocument[]
}
