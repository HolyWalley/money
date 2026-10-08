export type BankId = 'mbank' | 'pko'

export type BankNotificationSource =
  | { bank: BankId; sender: string; content: 'attachment'; attachment: RegExp }
  | { bank: BankId; sender: string; content: 'body' }

/**
 * The only mail the inbox keeps: anything else sent to a person's address is
 * refused, so what is stored is fixed here rather than by whoever sends.
 */
export const bankNotificationSources: readonly BankNotificationSource[] = [
  { bank: 'mbank', sender: 'kontakt@mbank.pl', content: 'attachment', attachment: /\.html?$/i },
  { bank: 'pko', sender: 'powiadomienia@pkobp.pl', content: 'body' },
]

/**
 * Mail that has to reach the person for forwarding to start: Gmail confirms a
 * forwarding address by mailing it a link.
 */
export const forwardingConfirmationSenders: readonly string[] = ['forwarding-noreply@google.com']

/** How long a notification waits in the inbox before it is deleted unread. */
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

/** A message for the person rather than for the parsers, shown as it arrived. */
export interface InboxNotice {
  messageId: string
  receivedAt: string
  sender: string
  subject: string
  text: string
}

export interface BankNotificationsResponse {
  documents: BankNotificationDocument[]
  notices: InboxNotice[]
  /** Where the bank should send notifications; null until one is created. */
  address: string | null
  /** The person's own mailbox allowed to forward notifications, as attached .eml files. */
  forwarder: string | null
}

export interface InboxAddressResponse {
  address: string
}

export interface InboxForwarderRequest {
  forwarder: string | null
}
