import type { CloudflareEnv } from '../types/cloudflare'
import type { UserSettings } from '../../shared/types/userSettings'
import { ResponseUtils } from '../utils/response'
import { SecurityUtils } from '../utils/security'
import { JWTUtils } from '../utils/jwt'

interface UserInfo {
  userId: string
  username: string
  settings: UserSettings
}

export async function onRequestPost(request: Request, env: CloudflareEnv, user: UserInfo): Promise<Response> {
  try {
    // Log the signout event
    SecurityUtils.logSecurityEvent('user_signout', {
      userId: user.userId,
      username: user.username
    }, request)

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
    }, request)
    return ResponseUtils.internalError('Failed to sign out')
  }
}
