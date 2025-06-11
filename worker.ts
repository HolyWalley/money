import { Router, IRequest } from 'itty-router'
import { JWTUtils } from './functions/utils/jwt'
import { StorageUtils } from './functions/utils/storage'
import { ResponseUtils } from './functions/utils/response'
import { SecurityUtils } from './functions/utils/security'
import type { CloudflareEnv } from './functions/types/cloudflare'
import type { UserSettings } from './shared/types/userSettings'

// Import route handlers
import { handleSignin } from './functions/api/v1/signin'
import { handleSignup } from './functions/api/v1/signup'
import { handleSignout } from './functions/api/v1/signout'
import { handleRefresh } from './functions/api/v1/refresh'
import { handleMe } from './functions/api/v1/me'

// Extend Request type to include our custom properties
interface AuthenticatedRequest extends IRequest {
  user?: {
    userId: string
    username: string
    settings: UserSettings
  }
  rateLimitHeaders?: Record<string, string>
}

// Create router
const router = Router()

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

// Security middleware - runs on all routes
const withSecurity = async (request: AuthenticatedRequest, env: CloudflareEnv) => {
  const url = new URL(request.url)
  const pathname = url.pathname

  // Security checks first
  const suspiciousActivity = SecurityUtils.detectSuspiciousActivity(request as unknown as Request)
  if (suspiciousActivity.length > 0) {
    SecurityUtils.logSecurityEvent('suspicious_activity', {
      issues: suspiciousActivity,
      pathname
    }, request as unknown as Request)

    // Block requests with multiple security issues
    if (suspiciousActivity.length >= 2) {
      return SecurityUtils.addSecurityHeaders(
        ResponseUtils.unauthorized('Request blocked for security reasons')
      )
    }
  }

  // Apply rate limiting
  const rateLimitConfig = RATE_LIMITS[pathname as keyof typeof RATE_LIMITS] || RATE_LIMITS.default
  const rateLimitResult = await SecurityUtils.checkRateLimit(request as unknown as Request, env, rateLimitConfig)

  if (!rateLimitResult.allowed) {
    SecurityUtils.logSecurityEvent('rate_limit_exceeded', {
      pathname,
      resetTime: rateLimitResult.resetTime
    }, request as unknown as Request)

    const response = ResponseUtils.error('Too many requests', 429, {
      'Retry-After': String(Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)),
      'X-RateLimit-Limit': String(rateLimitConfig.maxRequests),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(rateLimitResult.resetTime)
    })

    return SecurityUtils.addSecurityHeaders(response)
  }

  // Store rate limit headers for later use
  request.rateLimitHeaders = {
    'X-RateLimit-Limit': String(rateLimitConfig.maxRequests),
    'X-RateLimit-Remaining': String(rateLimitResult.remainingRequests),
    'X-RateLimit-Reset': String(rateLimitResult.resetTime)
  }
}

// Authentication middleware - only for protected routes
const withAuth = async (request: AuthenticatedRequest, env: CloudflareEnv) => {
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

// Response middleware - adds headers to all responses
const withHeaders = (response: Response, request: AuthenticatedRequest) => {
  // Add rate limit headers
  if (request.rateLimitHeaders) {
    Object.entries(request.rateLimitHeaders).forEach(([key, value]) => {
      response.headers.set(key, value)
    })
  }

  // Add security headers
  return SecurityUtils.addSecurityHeaders(response)
}

// Apply security middleware to all routes
router.all('*', withSecurity)

// Apply auth middleware to all routes (it will skip public routes internally)
router.all('*', withAuth)

// Public routes
router.post('/api/v1/signin', async (request: AuthenticatedRequest, env: CloudflareEnv) => {
  const response = await handleSignin(request as unknown as Request, env)
  return withHeaders(response, request)
})

router.post('/api/v1/signup', async (request: AuthenticatedRequest, env: CloudflareEnv) => {
  const response = await handleSignup(request as unknown as Request, env)
  return withHeaders(response, request)
})

router.post('/api/v1/refresh', async (request: AuthenticatedRequest, env: CloudflareEnv) => {
  const response = await handleRefresh(request as unknown as Request, env)
  return withHeaders(response, request)
})

// Protected routes
router.post('/api/v1/signout', async (request: AuthenticatedRequest, env: CloudflareEnv) => {
  const response = await handleSignout(request as unknown as Request, env, request.user!)
  return withHeaders(response, request)
})

router.get('/api/v1/me', async (request: AuthenticatedRequest, env: CloudflareEnv) => {
  const response = await handleMe(request as unknown as Request, env, request.user!)
  return withHeaders(response, request)
})

router.put('/api/v1/me', async (request: AuthenticatedRequest, env: CloudflareEnv) => {
  const response = await handleMe(request as unknown as Request, env, request.user!)
  return withHeaders(response, request)
})

// 404 handler
router.all('*', () => {
  return ResponseUtils.error('Not found', 404)
})

// Main fetch handler
export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    try {
      return await router.fetch(request, env, ctx)
    } catch (error) {
      console.error('Worker error:', error)
      return SecurityUtils.addSecurityHeaders(
        ResponseUtils.internalError('Internal server error')
      )
    }
  }
}

