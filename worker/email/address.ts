import type { CloudflareEnv } from '../types/cloudflare'

// No 0/o, 1/l: the address is read off a screen and typed into a bank's form.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'
const TOKEN_LENGTH = 16

/** Where mail to a token goes, and who besides the banks may send it. */
export interface InboxRoute {
  userId: string
  /** The person's own mailbox, trusted to pass bank notifications on as attached .eml files. */
  forwarder?: string
}

/**
 * A person's inbox is the local part of their address: a random token, mapped
 * to the account in KV. It is the only thing standing between a stranger and
 * the inbox, so it is long enough not to be guessed and can be replaced.
 */
export class InboxAddress {
  static generateToken(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH))
    return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('')
  }

  static key(token: string): string {
    return `inbox:${token}`
  }

  static format(token: string, domain: string): string {
    return `${token}@${domain}`
  }

  /** The token an envelope recipient names, or null if it cannot be one. */
  static tokenOf(recipient: string): string | null {
    const local = recipient.split('@')[0]?.toLowerCase() ?? ''
    if (local.length !== TOKEN_LENGTH) return null
    return [...local].every((character) => ALPHABET.includes(character)) ? local : null
  }

  static async routeFor(token: string, env: CloudflareEnv): Promise<InboxRoute | null> {
    const value = await env.MONEY_USER_AUTH.get(this.key(token))
    if (!value) return null
    try {
      const route = JSON.parse(value) as Partial<InboxRoute>
      if (typeof route.userId === 'string') return { userId: route.userId, ...(route.forwarder ? { forwarder: route.forwarder } : {}) }
    } catch {
      // The first addresses mapped to the bare user id.
    }
    return { userId: value }
  }

  static async saveRoute(token: string, route: InboxRoute, env: CloudflareEnv): Promise<void> {
    await env.MONEY_USER_AUTH.put(this.key(token), JSON.stringify(route))
  }
}
