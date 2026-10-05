import type { CloudflareEnv, UserInfo } from '../types/cloudflare'
import type { BankNotificationDocument, BankNotificationsResponse } from '../../shared/bank-notifications'
import { BANK_NOTIFICATION_DAYS, bankNotificationSources } from '../../shared/bank-notifications'
import type { MailProvider } from '../mail'
import { MailProviderError, createMailProvider } from '../mail'
import { BinaryUtils } from '../utils/binary'
import { ResponseUtils } from '../utils/response'

/**
 * Nothing read here is written anywhere: attachments are held in memory for
 * the length of the request, and the answer is marked uncacheable.
 */
export async function onRequestGet(
  _request: Request,
  env: CloudflareEnv,
  user: UserInfo,
  provider: MailProvider | null = createMailProvider(env)
): Promise<Response> {
  // The mailbox behind the provider belongs to one person, not to every account.
  // Accounts are unique by lowercased username, so case is not part of the name.
  if (!env.BANK_IMPORT_USERNAME || user.username.toLowerCase() !== env.BANK_IMPORT_USERNAME.toLowerCase()) {
    return ResponseUtils.forbidden('Bank import is not available for your account')
  }
  if (!provider) {
    return ResponseUtils.serviceUnavailable('No mail provider is configured')
  }

  try {
    const documents: BankNotificationDocument[] = []

    for (const source of bankNotificationSources) {
      const messages = await provider.listMessages({ from: source.sender, sinceDays: BANK_NOTIFICATION_DAYS })
      const attachments = await Promise.all(
        messages.map((message) => provider.getAttachments(message.id, (filename) => source.attachment.test(filename)))
      )

      messages.forEach((message, index) => {
        for (const attachment of attachments[index]) {
          documents.push({
            bank: source.bank,
            messageId: message.id,
            receivedAt: message.receivedAt,
            filename: attachment.filename,
            content: BinaryUtils.toBase64(attachment.bytes),
          })
        }
      })
    }

    const body: BankNotificationsResponse = { documents }
    const response = ResponseUtils.success(body)
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    if (error instanceof MailProviderError) {
      console.error(`[BankNotificationsHandler] Mail provider failed (${error.failure}): ${error.message}`)
      return error.failure === 'auth'
        ? ResponseUtils.serviceUnavailable('The mail provider token has expired')
        : ResponseUtils.serviceUnavailable('The mail provider is temporarily unavailable')
    }
    console.error('[BankNotificationsHandler] GET error:', error instanceof Error ? error.message : 'unknown error')
    return ResponseUtils.internalError()
  }
}
