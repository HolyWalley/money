import { JWTUtils } from '../utils/jwt'
import { StorageUtils } from '../utils/storage'
import { ResponseUtils } from '../utils/response'
import type { CloudflareContext } from '../types/cloudflare'

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/api/v1/signin',
  '/api/v1/signup',
  '/api/v1/refresh'
]

export async function onRequest(context: CloudflareContext): Promise<Response> {
  const { request, next, env } = context
  
  try {
    const url = new URL(request.url)
    const pathname = url.pathname

    // Skip authentication for public routes
    if (PUBLIC_ROUTES.includes(pathname)) {
      return next()
    }

    // Parse cookies
    const cookies = ResponseUtils.parseCookies(request)
    const accessToken = cookies.accessToken

    if (!accessToken) {
      return ResponseUtils.unauthorized('Access token required')
    }

    // Verify access token
    const payload = await JWTUtils.verifyAccessToken(accessToken, env)
    if (!payload) {
      return ResponseUtils.unauthorized('Invalid or expired access token')
    }

    // Verify user still exists and is active
    const user = await StorageUtils.getUserByUsername(payload.username, env)
    if (!user || !user.isActive) {
      return ResponseUtils.unauthorized('User not found or inactive')
    }

    // Add user info to context for downstream handlers
    context.user = {
      userId: user.userId,
      username: user.username
    }

    return next()

  } catch (error) {
    console.error('Middleware error:', error)
    return ResponseUtils.internalError('Authentication failed')
  }
}
