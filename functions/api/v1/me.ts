import type { CloudflareContext } from '../../types/cloudflare'
import { StorageUtils } from '../../utils/storage'
import { ResponseUtils } from '../../utils/response'

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
        updatedAt: user.updatedAt
      }
    })

  } catch (error) {
    console.error('Me endpoint error:', error)
    return ResponseUtils.internalError('Failed to get user data')
  }
}

export async function onRequest(context: CloudflareContext): Promise<Response> {
  const { request } = context
  
  if (request.method === 'GET') {
    return onRequestGet(context)
  }
  
  return ResponseUtils.methodNotAllowed()
}
