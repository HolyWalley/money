export type MailSearchDays = 7 | 30 | 90

export interface MailMessageRef {
  id: string
  receivedAt: string
}

export interface MailAttachment {
  filename: string
  contentType: string
  bytes: Uint8Array
}

export interface MailProvider {
  listMessages(query: { from: string; sinceDays: MailSearchDays }): Promise<MailMessageRef[]>
  /** The message body as HTML. */
  getBody(messageId: string): Promise<string>
  /** Downloads the attachments `wanted` accepts, into memory only. */
  getAttachments(messageId: string, wanted: (filename: string) => boolean): Promise<MailAttachment[]>
}

export type MailProviderFailure = 'auth' | 'unavailable'

export class MailProviderError extends Error {
  failure: MailProviderFailure

  constructor(failure: MailProviderFailure, message: string) {
    super(message)
    this.name = 'MailProviderError'
    this.failure = failure
  }
}
