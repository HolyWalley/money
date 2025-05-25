import type { CloudflareContext } from '../../types/cloudflare'
import { ResponseUtils } from '../../utils/response'

export async function onRequestPost(): Promise<Response> {
  try {
    // Create success response
    const response = ResponseUtils.success({
      message: 'Signed out successfully'
    })

    // Clear auth cookies
    return ResponseUtils.clearCookies(response, ['accessToken', 'refreshToken'])

  } catch (error) {
    console.error('Signout error:', error)
    return ResponseUtils.internalError('Failed to sign out')
  }
}

export async function onRequest(context: CloudflareContext): Promise<Response> {
  const { request } = context

  if (request.method === 'POST') {
    return onRequestPost()
  }

  return ResponseUtils.methodNotAllowed()
}
