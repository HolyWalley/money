import type { CloudflareContext } from '../../types/cloudflare'
import { JWTUtils } from '../../utils/jwt'
import { PasswordUtils } from '../../utils/password'
import { StorageUtils } from '../../utils/storage'
import { ResponseUtils } from '../../utils/response'
import { SecurityUtils } from '../../utils/security'

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
      SecurityUtils.logSecurityEvent('invalid_json_signin', {}, request)
      return ResponseUtils.error('Invalid JSON in request body')
    }

    let { username } = body
    const { password } = body

    // Input validation and sanitization
    if (typeof username !== 'string' || typeof password !== 'string') {
      SecurityUtils.logSecurityEvent('invalid_input_types_signin', {
        usernameType: typeof username,
        passwordType: typeof password
      }, request)
      return ResponseUtils.error('Username and password must be strings')
    }

    // Basic validation
    if (!username?.trim() || !password) {
      SecurityUtils.logSecurityEvent('empty_credentials', {
        hasUsername: !!username?.trim(),
        hasPassword: !!password
      }, request)
      return ResponseUtils.error('Username and password are required')
    }

    // Sanitize username
    const originalUsername = username
    username = SecurityUtils.sanitizeUsername(username.trim())
    
    if (originalUsername !== username) {
      SecurityUtils.logSecurityEvent('username_sanitized_signin', {
        original: originalUsername,
        sanitized: username
      }, request)
    }

    // Prevent timing attacks by always performing password verification
    // even if user doesn't exist
    const user = await StorageUtils.getUserByUsername(username, env)
    let isValidCredentials = false
    
    if (user && user.isActive) {
      // Verify password
      isValidCredentials = await PasswordUtils.verifyPassword(password, user.passwordHash)
      
      if (isValidCredentials) {
        // Update last login time directly
        await StorageUtils.updateUser(user.username, {
          lastLoginAt: new Date().toISOString()
        }, env)
        
        SecurityUtils.logSecurityEvent('successful_signin', {
          userId: user.userId,
          username: user.username
        }, request)
      } else {
        SecurityUtils.logSecurityEvent('failed_signin_invalid_password', {
          username
        }, request)
      }
    } else {
      // User doesn't exist or is inactive
      SecurityUtils.logSecurityEvent('failed_signin_user_not_found', {
        username,
        userExists: !!user,
        userActive: user?.isActive
      }, request)
      
      // Still perform a dummy password hash to prevent timing attacks
      await PasswordUtils.hashPassword('dummy_password_to_prevent_timing_attacks')
    }

    if (!isValidCredentials || !user) {
      // Use constant error message to prevent username enumeration
      return ResponseUtils.unauthorized('Invalid credentials')
    }

    // Generate tokens
    const tokens = await JWTUtils.generateTokenPair(user.userId, user.username, env)

    // Create response
    const response = ResponseUtils.success({
      user: {
        userId: user.userId,
        username: user.username,
        createdAt: user.createdAt,
        lastLoginAt: new Date().toISOString()
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
    SecurityUtils.logSecurityEvent('signin_internal_error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    }, request)
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
