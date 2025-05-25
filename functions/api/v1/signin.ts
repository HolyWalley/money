import type { CloudflareContext } from '../../types/cloudflare'
import { JWTUtils } from '../../utils/jwt'
import { PasswordUtils } from '../../utils/password'
import { StorageUtils } from '../../utils/storage'
import { ResponseUtils } from '../../utils/response'

interface SigninRequest {
  username: string
  password: string
}

export async function onRequestPost(context: CloudflareContext): Promise<Response> {
  try {
    const { request, env } = context
    
    // Parse request body
    let body: SigninRequest
    try {
      body = await request.json()
    } catch {
      return ResponseUtils.error('Invalid JSON in request body')
    }

    const { username, password } = body

    // Basic validation
    if (!username || !password) {
      return ResponseUtils.error('Username and password are required')
    }

    // Get user from storage
    const user = await StorageUtils.getUserByUsername(username, env)
    if (!user || !user.isActive) {
      return ResponseUtils.unauthorized('Invalid credentials')
    }

    // Verify password
    const isPasswordValid = await PasswordUtils.verifyPassword(password, user.passwordHash)
    if (!isPasswordValid) {
      return ResponseUtils.unauthorized('Invalid credentials')
    }

    // Generate tokens
    const tokens = await JWTUtils.generateTokenPair(user.userId, user.username, env)

    // Create response
    const response = ResponseUtils.success({
      user: {
        userId: user.userId,
        username: user.username,
        createdAt: user.createdAt
      }
    })

    // Set cookies
    return ResponseUtils.setCookies(response, [
      {
        name: 'accessToken',
        value: tokens.accessToken,
        options: JWTUtils.getCookieOptions(false)
      },
      {
        name: 'refreshToken',
        value: tokens.refreshToken,
        options: JWTUtils.getCookieOptions(true)
      }
    ])

  } catch (error) {
    console.error('Signin error:', error)
    return ResponseUtils.internalError('Failed to sign in')
  }
}

export async function onRequest(context: CloudflareContext): Promise<Response> {
  const { request } = context
  
  if (request.method === 'POST') {
    return onRequestPost(context)
  }
  
  return ResponseUtils.methodNotAllowed()
}