import { ResponseUtils } from '../utils/response'
import type { AuthenticatedRequest } from './security'
import type { CloudflareEnv } from '../types/cloudflare'

// Development-only middleware - only allows requests from localhost
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const withDevOnly = async (request: AuthenticatedRequest, env: CloudflareEnv) => {
  const url = new URL(request.url)

  // Only allow localhost and 127.0.0.1 in development
  if (!url.hostname.includes('localhost') && !url.hostname.includes('127.0.0.1')) {
    return ResponseUtils.notFound()
  }

  // Allow request to proceed
  return
}

