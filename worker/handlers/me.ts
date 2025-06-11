import type { CloudflareEnv } from '../types/cloudflare'
import type { UserSettings } from '../../shared/types/userSettings'
import { StorageUtils } from '../utils/storage'
import { ResponseUtils } from '../utils/response'
import { UpdateUserSchema } from '../../shared/schemas/update_user.schema'

interface UserInfo {
  userId: string
  username: string
  settings: UserSettings
}

export async function onRequestGet(request: Request, env: CloudflareEnv, userInfo: UserInfo): Promise<Response> {
  try {
    // Get full user data from storage
    const user = await StorageUtils.getUserByUsername(userInfo.username, env)
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
    const user = await StorageUtils.getUserByUsername(userInfo.username, env)
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
