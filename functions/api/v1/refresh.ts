import type { CloudflareContext } from '../../types/cloudflare'
import { JWTUtils } from '../../utils/jwt'
import { StorageUtils } from '../../utils/storage'
import { ResponseUtils } from '../../utils/response'

export async function onRequestPost(context: CloudflareContext): Promise<Response> {
  try {
    const { request, env } = context
    
    // Parse cookies
    const cookies = ResponseUtils.parseCookies(request)
    const refreshToken = cookies.refreshToken

    if (!refreshToken) {
      return ResponseUtils.unauthorized('Refresh token not found')
    }

    // Verify refresh token
    const payload = await JWTUtils.verifyRefreshToken(refreshToken, env)
    if (!payload) {
      return ResponseUtils.unauthorized('Invalid or expired refresh token')
    }

    // Verify user still exists and is active
    const user = await StorageUtils.getUserByUsername(payload.username, env)
    if (!user || !user.isActive) {
      return ResponseUtils.unauthorized('User not found or inactive')
    }

    // Generate new token pair
    const tokens = await JWTUtils.generateTokenPair(user.userId, user.username, env)

    // Create response
    const response = ResponseUtils.success({
      message: 'Tokens refreshed successfully'
    })

    // Set new cookies
    return ResponseUtils.setCookies(response, [
      {
        name: 'accessToken',
        value: tokens.accessToken,
        options: JWTUtils.getCookieOptions(false)
      },
      {
        name: 'refreshToken',
        value: tokens.refreshToken,
        options: JWTUtils.getCookieOptions(true)
      }
    ])

  } catch (error) {
    console.error('Refresh error:', error)
    return ResponseUtils.internalError('Failed to refresh tokens')
  }
}

export async function onRequest(context: CloudflareContext): Promise<Response> {
  const { request } = context
  
  if (request.method === 'POST') {
    return onRequestPost(context)
  }
  
  return ResponseUtils.methodNotAllowed()
}
