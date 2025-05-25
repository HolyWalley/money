import type { CloudflareContext } from '../../types/cloudflare'
import { ResponseUtils } from '../../utils/response'
import { SecurityUtils } from '../../utils/security'
import { JWTUtils } from '../../utils/jwt'

export async function onRequestPost(context: CloudflareContext): Promise<Response> {
  try {
    const { request } = context
    
    // Log the signout event (user info is available from middleware)
    if (context.user) {
      SecurityUtils.logSecurityEvent('user_signout', {
        userId: context.user.userId,
        username: context.user.username
      }, request)
    }

    // Create success response
    const response = ResponseUtils.success({
      message: 'Signed out successfully'
    })

    // Clear auth cookies securely
    return ResponseUtils.setCookies(response, [
      {
        name: 'accessToken',
        value: '',
        options: JWTUtils.getClearCookieOptions()
      },
      {
        name: 'refreshToken',
        value: '',
        options: JWTUtils.getClearCookieOptions()
      }
    ])

  } catch (error) {
    console.error('Signout error:', error)
    SecurityUtils.logSecurityEvent('signout_error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    }, context.request)
    return ResponseUtils.internalError('Failed to sign out')
  }
}

export async function onRequest(context: CloudflareContext): Promise<Response> {
  const { request } = context

  if (request.method === 'POST') {
    return onRequestPost(context)
  }

  return ResponseUtils.methodNotAllowed()
}
