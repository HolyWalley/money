import type { CloudflareContext } from '../../types/cloudflare'
import { StorageUtils } from '../../utils/storage'
import { ResponseUtils } from '../../utils/response'
import { UpdateUserSchema } from '../../../shared/schemas/update_user.schema'

export async function onRequestGet(context: CloudflareContext): Promise<Response> {
  try {
    const { env, data } = context

    // Get user from context (already authenticated by middleware)
    if (!data?.user) {
      return ResponseUtils.unauthorized('User not authenticated')
    }

    // Get full user data from storage
    const user = await StorageUtils.getUserByUsername(data.user.username, env)
    if (!user || !user.isActive) {
      return ResponseUtils.unauthorized('User not found or inactive')
    }

    // Return user data
    return ResponseUtils.success({
      user: {
        userId: user.userId,
        username: user.username,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        settings: user.settings,
      }
    })

  } catch (error) {
    console.error('Me endpoint error:', error)
    return ResponseUtils.internalError('Failed to get user data')
  }
}

export async function onRequestPut(context: CloudflareContext): Promise<Response> {
  try {
    const { env, data, request } = context

    // Get user from context (already authenticated by middleware)
    if (!data?.user) {
      return ResponseUtils.unauthorized('User not authenticated')
    }

    // Parse request body
    const body = await request.json()

    // Validate input
    const validationResult = UpdateUserSchema.safeParse(body)
    if (!validationResult.success) {
      return ResponseUtils.validationError([])
    }

    const updateData = validationResult.data

    // Get current user data
    const user = await StorageUtils.getUserByUsername(data.user.username, env)
    if (!user || !user.isActive) {
      return ResponseUtils.unauthorized('User not found or inactive')
    }

    // Update user data
    const updatedUser = {
      ...user,
      ...(updateData.settings && { settings: { ...user.settings, ...updateData.settings } }),
      updatedAt: new Date().toISOString()
    }

    // Save updated user
    await StorageUtils.updateUser(user.username, updatedUser, env)

    // Return updated user data
    return ResponseUtils.success({
      user: {
        userId: updatedUser.userId,
        username: updatedUser.username,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
        settings: updatedUser.settings,
      }
    })

  } catch (error) {
    console.error('Update user error:', error)
    return ResponseUtils.internalError('Failed to update user data')
  }
}

export async function onRequest(context: CloudflareContext): Promise<Response> {
  const { request } = context

  if (request.method === 'GET') {
    return onRequestGet(context)
  }

  if (request.method === 'PUT') {
    return onRequestPut(context)
  }

  return ResponseUtils.methodNotAllowed()
}
