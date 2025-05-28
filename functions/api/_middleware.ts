import { JWTUtils } from '../utils/jwt'
import { StorageUtils } from '../utils/storage'
import { ResponseUtils } from '../utils/response'
import { SecurityUtils } from '../utils/security'
import type { CloudflareContext } from '../types/cloudflare'

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/api/v1/signin',
  '/api/v1/signup',
  '/api/v1/refresh'
]

// Rate limiting configurations by endpoint
const RATE_LIMITS = {
  '/api/v1/signin': { windowMs: 15 * 60 * 1000, maxRequests: 5 }, // 5 attempts per 15 minutes
  '/api/v1/signup': { windowMs: 60 * 60 * 1000, maxRequests: 3 }, // 3 signups per hour
  '/api/v1/refresh': { windowMs: 5 * 60 * 1000, maxRequests: 10 }, // 10 refreshes per 5 minutes
  'default': { windowMs: 60 * 1000, maxRequests: 60 } // 60 requests per minute for other endpoints
}

export async function onRequest(context: CloudflareContext): Promise<Response> {
  const { request, next, env } = context

  try {
    const url = new URL(request.url)
    const pathname = url.pathname

    // Security checks first
    const suspiciousActivity = SecurityUtils.detectSuspiciousActivity(request)
    if (suspiciousActivity.length > 0) {
      SecurityUtils.logSecurityEvent('suspicious_activity', {
        issues: suspiciousActivity,
        pathname
      }, request)

      // Block requests with multiple security issues
      if (suspiciousActivity.length >= 2) {
        return ResponseUtils.unauthorized('Request blocked for security reasons')
      }
    }

    // Apply rate limiting
    const rateLimitConfig = RATE_LIMITS[pathname as keyof typeof RATE_LIMITS] || RATE_LIMITS.default
    const rateLimitResult = await SecurityUtils.checkRateLimit(request, env, rateLimitConfig)

    if (!rateLimitResult.allowed) {
      SecurityUtils.logSecurityEvent('rate_limit_exceeded', {
        pathname,
        resetTime: rateLimitResult.resetTime
      }, request)

      const response = ResponseUtils.error('Too many requests', 429, {
        'Retry-After': String(Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)),
        'X-RateLimit-Limit': String(rateLimitConfig.maxRequests),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(rateLimitResult.resetTime)
      })

      return SecurityUtils.addSecurityHeaders(response)
    }

    // Add rate limit headers to all responses
    const rateLimitHeaders = {
      'X-RateLimit-Limit': String(rateLimitConfig.maxRequests),
      'X-RateLimit-Remaining': String(rateLimitResult.remainingRequests),
      'X-RateLimit-Reset': String(rateLimitResult.resetTime)
    }

    // Skip authentication for public routes
    if (PUBLIC_ROUTES.includes(pathname)) {
      const response = await next()

      // Add rate limit headers
      Object.entries(rateLimitHeaders).forEach(([key, value]) => {
        response.headers.set(key, value)
      })

      return SecurityUtils.addSecurityHeaders(response)
    }

    // Authentication required for protected routes
    const cookies = ResponseUtils.parseCookies(request)
    const accessToken = cookies.accessToken

    if (!accessToken) {
      SecurityUtils.logSecurityEvent('missing_access_token', { pathname }, request)
      const response = ResponseUtils.unauthorized('Access token required')
      return SecurityUtils.addSecurityHeaders(response)
    }

    // Verify access token
    const payload = await JWTUtils.verifyAccessToken(accessToken, env)
    if (!payload) {
      SecurityUtils.logSecurityEvent('invalid_access_token', { pathname }, request)
      const response = ResponseUtils.unauthorized('Invalid or expired access token')
      return SecurityUtils.addSecurityHeaders(response)
    }

    // Verify user still exists and is active
    const user = await StorageUtils.getUserByUsername(payload.username, env)
    if (!user || !user.isActive) {
      SecurityUtils.logSecurityEvent('inactive_user_access', {
        username: payload.username,
        pathname
      }, request)
      const response = ResponseUtils.unauthorized('User not found or inactive')
      return SecurityUtils.addSecurityHeaders(response)
    }

    // Add user info to context for downstream handlers
    context.data = {
      user: {
        userId: user.userId,
        username: user.username,
        settings: user.settings,
      }
    }

    // Call next middleware/handler
    const response = await next()

    // Add security and rate limit headers
    Object.entries(rateLimitHeaders).forEach(([key, value]) => {
      response.headers.set(key, value)
    })

    return SecurityUtils.addSecurityHeaders(response)

  } catch (error) {
    console.error('Middleware error:', error)
    SecurityUtils.logSecurityEvent('middleware_error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    }, request)

    const response = ResponseUtils.internalError('Authentication failed')
    return SecurityUtils.addSecurityHeaders(response)
  }
}
