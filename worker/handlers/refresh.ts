import type { CloudflareEnv } from '../types/cloudflare'
import { JWTUtils } from '../utils/jwt'
import { StorageUtils } from '../utils/storage'
import { ResponseUtils } from '../utils/response'

export async function onRequestPost(request: Request, env: CloudflareEnv): Promise<Response> {
  try {
    
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
        options: JWTUtils.getCookieOptions(false, env)
      },
      {
        name: 'refreshToken',
        value: tokens.refreshToken,
        options: JWTUtils.getCookieOptions(true, env)
      }
    ])

  } catch (error) {
    console.error('Refresh error:', error)
    return ResponseUtils.internalError('Failed to refresh tokens')
  }
}
