import { z } from 'zod'
import type { CloudflareEnv, UserInfo } from '../types/cloudflare'
import type { BankNotificationsResponse, InboxAddressResponse } from '../../shared/bank-notifications'
import { InboxAddress } from '../email/address'
import { StorageUtils } from '../utils/storage'
import { ResponseUtils } from '../utils/response'

const RemoveSchema = z.object({
  messageIds: z.array(z.string().min(1).max(998)).min(1).max(500),
})

const ForwarderSchema = z.object({
  forwarder: z.string().trim().toLowerCase().email().max(254).nullable(),
})

function inboxOf(env: CloudflareEnv, user: UserInfo) {
  return env.MONEY_OBJECT.get(env.MONEY_OBJECT.idFromName(user.userId))
}

export async function onRequestGet(_request: Request, env: CloudflareEnv, user: UserInfo): Promise<Response> {
  try {
    const read = await StorageUtils.readUserByUsername(user.username, env)
    if (read.status === 'error') return ResponseUtils.serviceUnavailable()
    if (read.status === 'not-found') return ResponseUtils.unauthorized('User not found')

    const { documents, notices } = await inboxOf(env, user).listInbox()
    const token = read.value.inboxToken
    const body: BankNotificationsResponse = {
      documents,
      notices,
      address: token && env.INBOX_DOMAIN ? InboxAddress.format(token, env.INBOX_DOMAIN) : null,
      forwarder: read.value.inboxForwarder ?? null,
    }
    const response = ResponseUtils.success(body)
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    console.error('[BankNotificationsHandler] GET error:', error instanceof Error ? error.message : 'unknown error')
    return ResponseUtils.internalError()
  }
}

/** Forgets messages the person has dealt with, so they are not kept for the full retention window. */
export async function onRequestDelete(request: Request, env: CloudflareEnv, user: UserInfo): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return ResponseUtils.validationError(['Invalid JSON'])
  }
  const parsed = RemoveSchema.safeParse(body)
  if (!parsed.success) return ResponseUtils.validationError(['messageIds must be a non-empty list'])

  try {
    await inboxOf(env, user).removeFromInbox(parsed.data.messageIds)
    return ResponseUtils.success({ removed: parsed.data.messageIds.length })
  } catch (error) {
    console.error('[BankNotificationsHandler] DELETE error:', error instanceof Error ? error.message : 'unknown error')
    return ResponseUtils.internalError()
  }
}

/**
 * Gives the person a new address. The old one stops accepting mail at once,
 * which is the point of replacing it.
 */
export async function onRequestPostAddress(_request: Request, env: CloudflareEnv, user: UserInfo): Promise<Response> {
  if (!env.INBOX_DOMAIN) return ResponseUtils.serviceUnavailable('Receiving mail is not set up on this server')

  try {
    const read = await StorageUtils.readUserByUsername(user.username, env)
    if (read.status === 'error') return ResponseUtils.serviceUnavailable()
    if (read.status === 'not-found') return ResponseUtils.unauthorized('User not found')

    const token = InboxAddress.generateToken()
    const forwarder = read.value.inboxForwarder
    await InboxAddress.saveRoute(token, { userId: user.userId, ...(forwarder ? { forwarder } : {}) }, env)
    if (!(await StorageUtils.updateUser(user.username, { inboxToken: token }, env))) {
      await env.MONEY_USER_AUTH.delete(InboxAddress.key(token))
      return ResponseUtils.serviceUnavailable()
    }
    const previous = read.value.inboxToken
    if (previous) await env.MONEY_USER_AUTH.delete(InboxAddress.key(previous))

    const body: InboxAddressResponse = { address: InboxAddress.format(token, env.INBOX_DOMAIN) }
    return ResponseUtils.success(body)
  } catch (error) {
    console.error('[BankNotificationsHandler] POST address error:', error instanceof Error ? error.message : 'unknown error')
    return ResponseUtils.internalError()
  }
}

/**
 * Names the person's own mailbox as one that may forward bank notifications,
 * for a mailbox that cannot redirect mail on its own; null stops it.
 */
export async function onRequestPutForwarder(request: Request, env: CloudflareEnv, user: UserInfo): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return ResponseUtils.validationError(['Invalid JSON'])
  }
  const parsed = ForwarderSchema.safeParse(body)
  if (!parsed.success) return ResponseUtils.validationError(['forwarder must be an email address or null'])
  const forwarder = parsed.data.forwarder ?? undefined

  try {
    const read = await StorageUtils.readUserByUsername(user.username, env)
    if (read.status === 'error') return ResponseUtils.serviceUnavailable()
    if (read.status === 'not-found') return ResponseUtils.unauthorized('User not found')

    if (!(await StorageUtils.updateUser(user.username, { inboxForwarder: forwarder }, env))) {
      return ResponseUtils.serviceUnavailable()
    }
    const token = read.value.inboxToken
    if (token) await InboxAddress.saveRoute(token, { userId: user.userId, ...(forwarder ? { forwarder } : {}) }, env)

    return ResponseUtils.success({ forwarder: forwarder ?? null })
  } catch (error) {
    console.error('[BankNotificationsHandler] PUT forwarder error:', error instanceof Error ? error.message : 'unknown error')
    return ResponseUtils.internalError()
  }
}
