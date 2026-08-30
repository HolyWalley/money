import type { CloudflareEnv, UserInfo } from '../types/cloudflare'
import { StorageUtils } from '../utils/storage'
import { ResponseUtils } from '../utils/response'
import { UpdateUserSchema } from '../../shared/schemas/update_user.schema'

export async function onRequestGet(_request: Request, env: CloudflareEnv, userInfo: UserInfo): Promise<Response> {
  try {
    // Get full user data from storage
    const read = await StorageUtils.readUserByUsername(userInfo.username, env)
    if (read.status === 'error') {
      // A KV read failure is infrastructure, not a verdict. Returning 401 here is
      // what makes a transient blip indistinguishable from a deleted account, and
      // the client is entitled to treat a 401 as a definitive logout.
      return ResponseUtils.serviceUnavailable()
    }
    if (read.status === 'not-found' || !read.value.isActive) {
      return ResponseUtils.unauthorized('User not found or inactive')
    }
    const user = read.value

    // Return user data
    return ResponseUtils.success({
      user: {
        userId: user.userId,
        username: user.username,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        premium: user.premium,
        settings: user.settings,
      }
    })

  } catch (error) {
    console.error('Me endpoint error:', error)
    return ResponseUtils.internalError('Failed to get user data')
  }
}

export async function onRequestPut(request: Request, env: CloudflareEnv, userInfo: UserInfo): Promise<Response> {
  try {
    // Parse request body
    const body = await request.json()

    // Validate input
    const validationResult = UpdateUserSchema.safeParse(body)
    if (!validationResult.success) {
      return ResponseUtils.validationError([])
    }

    const updateData = validationResult.data

    // Get current user data
    const read = await StorageUtils.readUserByUsername(userInfo.username, env)
    if (read.status === 'error') {
      // A KV read failure is infrastructure, not a verdict. Returning 401 here is
      // what makes a transient blip indistinguishable from a deleted account, and
      // the client is entitled to treat a 401 as a definitive logout.
      return ResponseUtils.serviceUnavailable()
    }
    if (read.status === 'not-found' || !read.value.isActive) {
      return ResponseUtils.unauthorized('User not found or inactive')
    }
    const user = read.value

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
        premium: updatedUser.premium,
        settings: updatedUser.settings,
      }
    })

  } catch (error) {
    console.error('Update user error:', error)
    return ResponseUtils.internalError('Failed to update user data')
  }
}
