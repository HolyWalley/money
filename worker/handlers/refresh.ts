import type { CloudflareEnv } from '../types/cloudflare'
import { isJWTConfigurationError, JWTUtils } from '../utils/jwt'
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
    const read = await StorageUtils.readUserByUsername(payload.username, env)
    if (read.status === 'error') {
      // A KV read failure is infrastructure, not a verdict. Returning 401 here is
      // what makes a transient blip indistinguishable from a deleted account, and
      // the client is entitled to treat a 401 on /refresh as a definitive logout.
      return ResponseUtils.serviceUnavailable()
    }
    if (read.status === 'not-found' || !read.value.isActive) {
      return ResponseUtils.unauthorized('User not found or inactive')
    }
    const user = read.value

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
    // "We cannot evaluate tokens right now" is not "your token is bad". A 401 here
    // is the one verdict the client is allowed to treat as a definitive logout, so a
    // mis-bound secret would mass-log-out every user and wipe their cached identity.
    if (isJWTConfigurationError(error)) {
      return ResponseUtils.serviceUnavailable()
    }
    return ResponseUtils.internalError('Failed to refresh tokens')
  }
}
