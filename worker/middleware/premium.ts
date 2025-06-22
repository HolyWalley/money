import { ResponseUtils } from '../utils/response'
import type { AuthenticatedRequest } from './security'
import type { CloudflareEnv } from '../types/cloudflare'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const withPremium = async (request: AuthenticatedRequest, env: CloudflareEnv) => {
  if (!request?.user?.premium?.active) {
    // If not premium, return a 403 Forbidden response
    return ResponseUtils.forbidden('Premium features are not available for your account')
  }

  return
}

