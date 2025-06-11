import type { CloudflareEnv } from '../types/cloudflare'
import type { AuthenticatedRequest } from './security'
import { JWTUtils } from '../utils/jwt'
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
  const payload = await JWTUtils.verifyAccessToken(accessToken, env)
  if (!payload) {
    SecurityUtils.logSecurityEvent('invalid_access_token', { pathname }, request as unknown as Request)
    return SecurityUtils.addSecurityHeaders(
      ResponseUtils.unauthorized('Invalid or expired access token')
    )
  }

  // Verify user still exists and is active
  const user = await StorageUtils.getUserByUsername(payload.username, env)
  if (!user || !user.isActive) {
    SecurityUtils.logSecurityEvent('inactive_user_access', {
      username: payload.username,
      pathname
    }, request as unknown as Request)
    return SecurityUtils.addSecurityHeaders(
      ResponseUtils.unauthorized('User not found or inactive')
    )
  }

  // Add user to request for use in handlers
  request.user = {
    userId: user.userId,
    username: user.username,
    settings: user.settings,
  }
}
