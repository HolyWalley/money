import type { AuthenticatedRequest } from './security'
import { SecurityUtils } from '../utils/security'

// Response middleware - adds headers to all responses
export const withHeaders = (response: Response, request: AuthenticatedRequest) => {
  // Add rate limit headers
  if (request.rateLimitHeaders) {
    Object.entries(request.rateLimitHeaders).forEach(([key, value]) => {
      response.headers.set(key, value)
    })
  }

  // Add security headers
  return SecurityUtils.addSecurityHeaders(response)
}
