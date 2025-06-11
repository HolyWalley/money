import type { CloudflareEnv } from '../types/cloudflare'
import type { UserSettings } from '../../shared/types/userSettings'
import { SecurityUtils } from '../utils/security'
import { ResponseUtils } from '../utils/response'
import { IRequest } from 'itty-router'

export interface AuthenticatedRequest extends IRequest {
  user?: {
    userId: string
    username: string
    settings: UserSettings
  }
  rateLimitHeaders?: Record<string, string>
}

// Rate limiting configurations by endpoint
export const RATE_LIMITS = {
  '/api/v1/signin': { windowMs: 15 * 60 * 1000, maxRequests: 5 }, // 5 attempts per 15 minutes
  '/api/v1/signup': { windowMs: 60 * 60 * 1000, maxRequests: 3 }, // 3 signups per hour
  '/api/v1/refresh': { windowMs: 5 * 60 * 1000, maxRequests: 10 }, // 10 refreshes per 5 minutes
  'default': { windowMs: 60 * 1000, maxRequests: 60 } // 60 requests per minute for other endpoints
}

// Security middleware - runs on all routes
export const withSecurity = async (request: AuthenticatedRequest, env: CloudflareEnv) => {
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
