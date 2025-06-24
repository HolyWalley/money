import { JWTUtils } from '../utils/jwt'
import { PasswordUtils } from '../utils/password'
import { StorageUtils } from '../utils/storage'
import { ResponseUtils } from '../utils/response'
import { SecurityUtils } from '../utils/security'
import type { CloudflareEnv } from '../types/cloudflare'

interface SignupRequest {
  username: string
  password: string
}

export async function onRequestPost(request: Request, env: CloudflareEnv): Promise<Response> {
  try {

    // Parse request body
    let body: SignupRequest
    try {
      body = await request.json()
    } catch {
      SecurityUtils.logSecurityEvent('invalid_json_signup', {}, request)
      return ResponseUtils.error('Invalid JSON in request body')
    }

    let { username } = body
    const { password } = body

    // Input sanitization
    if (typeof username !== 'string' || typeof password !== 'string') {
      SecurityUtils.logSecurityEvent('invalid_input_types', {
        usernameType: typeof username,
        passwordType: typeof password
      }, request)
      return ResponseUtils.error('Username and password must be strings')
    }

    // Sanitize username (removes dangerous characters)
    const originalUsername = username
    username = SecurityUtils.sanitizeUsername(username)

    if (originalUsername !== username) {
      SecurityUtils.logSecurityEvent('username_sanitized', {
        original: originalUsername,
        sanitized: username
      }, request)
    }

    // Basic length checks before validation
    if (!username || username.length < 3) {
      return ResponseUtils.validationError(['Username must be at least 3 characters long'])
    }

    if (!password || password.length < 8) {
      return ResponseUtils.validationError(['Password must be at least 8 characters long'])
    }

    // Validate input
    const usernameValidation = PasswordUtils.validateUsername(username)
    const passwordValidation = PasswordUtils.validatePassword(password)

    const errors = [...usernameValidation.errors, ...passwordValidation.errors]
    if (errors.length > 0) {
      SecurityUtils.logSecurityEvent('signup_validation_failed', {
        username,
        errors
      }, request)
      return ResponseUtils.validationError(errors)
    }

    // Check if user already exists
    const existingUser = await StorageUtils.userExists(username, env)
    if (existingUser) {
      SecurityUtils.logSecurityEvent('signup_attempt_existing_user', {
        username
      }, request)
      return ResponseUtils.conflict('Username already exists')
    }

    // Hash password
    const passwordHash = await PasswordUtils.hashPassword(password)

    // Create user
    const user = await StorageUtils.createUser(username, passwordHash, env)

    SecurityUtils.logSecurityEvent('user_created', {
      userId: user.userId,
      username: user.username
    }, request)

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

    // Set cookies with secure flags
    return ResponseUtils.setCookies(response, [
      {
        name: 'accessToken',
        value: tokens.accessToken,
        options: JWTUtils.getCookieOptions(false, env)
      },
      {
        name: 'refreshToken',
        value: tokens.refreshToken,
        options: JWTUtils.getCookieOptions(true, env)
      }
    ])

  } catch (error) {
    console.error('Signup error:', error)
    SecurityUtils.logSecurityEvent('signup_internal_error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    }, request)
    return ResponseUtils.internalError('Failed to create account')
  }
}
