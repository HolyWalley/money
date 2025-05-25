import type { CloudflareContext } from '../../types/cloudflare'
import { JWTUtils } from '../../utils/jwt'
import { StorageUtils } from '../../utils/storage'
import { ResponseUtils } from '../../utils/response'

export async function onRequestGet(context: CloudflareContext): Promise<Response> {
  try {
    const { request, env } = context
    
    // Parse cookies
    const cookies = ResponseUtils.parseCookies(request)
    const accessToken = cookies.accessToken

    if (!accessToken) {
      return ResponseUtils.unauthorized('Access token not found')
    }

    // Verify access token
    const payload = await JWTUtils.verifyAccessToken(accessToken, env)
    if (!payload) {
      return ResponseUtils.unauthorized('Invalid or expired access token')
    }

    // Get user data from storage
    const user = await StorageUtils.getUserByUsername(payload.username, env)
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
