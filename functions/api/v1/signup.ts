import { JWTUtils } from '../../utils/jwt'
import { PasswordUtils } from '../../utils/password'
import { StorageUtils } from '../../utils/storage'
import { ResponseUtils } from '../../utils/response'
import type { CloudflareContext } from '../../types/cloudflare'

interface SignupRequest {
  username: string
  password: string
}

export async function onRequestPost(context: CloudflareContext): Promise<Response> {
  try {
    const { request, env } = context
    
    // Parse request body
    let body: SignupRequest
    try {
      body = await request.json()
    } catch {
      return ResponseUtils.error('Invalid JSON in request body')
    }

    const { username, password } = body

    // Validate input
    const usernameValidation = PasswordUtils.validateUsername(username)
    const passwordValidation = PasswordUtils.validatePassword(password)

    const errors = [...usernameValidation.errors, ...passwordValidation.errors]
    if (errors.length > 0) {
      return ResponseUtils.validationError(errors)
    }

    // Check if user already exists
    const existingUser = await StorageUtils.userExists(username, env)
    if (existingUser) {
      return ResponseUtils.conflict('Username already exists')
    }

    // Hash password
    const passwordHash = await PasswordUtils.hashPassword(password)

    // Create user
    const user = await StorageUtils.createUser(username, passwordHash, env)

    // Generate tokens
    const tokens = await JWTUtils.generateTokenPair(user.userId, user.username, env)

    // Create response
    const response = ResponseUtils.success({
      user: {
        userId: user.userId,
        username: user.username,
        createdAt: user.createdAt
      }
    }, 201)

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
    console.error('Signup error:', error)
    return ResponseUtils.internalError('Failed to create account')
  }
}

export async function onRequest(context: CloudflareContext): Promise<Response> {
  const { request } = context
  
  if (request.method === 'POST') {
    return onRequestPost(context)
  }
  
  return ResponseUtils.methodNotAllowed()
}