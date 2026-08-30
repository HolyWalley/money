import type { CloudflareEnv } from '../types/cloudflare'
import type { AuthenticatedRequest } from './security'
import { isJWTConfigurationError, JWTUtils } from '../utils/jwt'
import { StorageUtils } from '../utils/storage'
import { ResponseUtils } from '../utils/response'
import { SecurityUtils } from '../utils/security'

// Public routes that don't require authentication
export const PUBLIC_ROUTES = [
  '/api/v1/signin',
  '/api/v1/signup',
  '/api/v1/refresh'
]

// Authentication middleware - only for protected routes
export const withAuth = async (request: AuthenticatedRequest, env: CloudflareEnv) => {
  const url = new URL(request.url)
  const pathname = url.pathname

  // Skip authentication for public routes
  if (PUBLIC_ROUTES.includes(pathname)) {
    return
  }

  const cookies = ResponseUtils.parseCookies(request as unknown as Request)
  const accessToken = cookies.accessToken

  if (!accessToken) {
    SecurityUtils.logSecurityEvent('missing_access_token', { pathname }, request as unknown as Request)
    return SecurityUtils.addSecurityHeaders(
      ResponseUtils.unauthorized('Access token required')
    )
  }

  // Verify access token
  let payload
  try {
    payload = await JWTUtils.verifyAccessToken(accessToken, env)
  } catch (error) {
    // A misconfigured secret means we cannot evaluate any token, which is an outage,
    // not a rejection. Falling through to the 401 below would log every user out.
    if (!isJWTConfigurationError(error)) throw error
    console.error('Access token verification unavailable:', error)
    return SecurityUtils.addSecurityHeaders(ResponseUtils.serviceUnavailable())
  }
  if (!payload) {
    SecurityUtils.logSecurityEvent('invalid_access_token', { pathname }, request as unknown as Request)
    return SecurityUtils.addSecurityHeaders(
      ResponseUtils.unauthorized('Invalid or expired access token')
    )
  }

  // Verify user still exists and is active
  const read = await StorageUtils.readUserByUsername(payload.username, env)
  if (read.status === 'error') {
    // A KV read failure is infrastructure, not a verdict. Returning 401 here is
    // what makes a transient blip indistinguishable from a deleted account, and
    // the client is entitled to treat a 401 as a definitive logout.
    return SecurityUtils.addSecurityHeaders(
      ResponseUtils.serviceUnavailable()
    )
  }
  if (read.status === 'not-found' || !read.value.isActive) {
    SecurityUtils.logSecurityEvent('inactive_user_access', {
      username: payload.username,
      pathname
    }, request as unknown as Request)
    return SecurityUtils.addSecurityHeaders(
      ResponseUtils.unauthorized('User not found or inactive')
    )
  }
  const user = read.value

  // Add user to request for use in handlers
  request.user = {
    userId: user.userId,
    username: user.username,
    premium: user.premium,
    settings: user.settings,
  }
}
