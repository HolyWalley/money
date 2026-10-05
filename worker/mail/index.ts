import type { CloudflareEnv } from '../types/cloudflare'
import { HeyMailProvider } from './hey'
import type { MailProvider } from './types'

export function createMailProvider(env: CloudflareEnv): MailProvider | null {
  if (env.HEY_TOKEN) return new HeyMailProvider(env.HEY_TOKEN)
  return null
}

export type { MailAttachment, MailMessageRef, MailProvider, MailSearchDays } from './types'
export { MailProviderError } from './types'
