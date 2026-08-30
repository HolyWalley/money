import jwt from '@tsndr/cloudflare-worker-jwt'
import type { CloudflareEnv } from '../types/cloudflare'

export interface JWTPayload {
  userId: string
  username: string
  iat: number
  exp: number
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

// "We cannot evaluate tokens right now" is not "this token is invalid". Callers
// must never launder this into a 401: the client is entitled to treat a 401 on
// /refresh as a definitive logout, so a single mis-bound secret would sign every
// user out and erase their cached offline identity.
export class JWTConfigurationError extends Error {
  constructor(message = 'JWT secrets not configured') {
    super(message)
    this.name = 'JWTConfigurationError'
  }
}

export function isJWTConfigurationError(error: unknown): error is JWTConfigurationError {
  return error instanceof JWTConfigurationError
}

export class JWTUtils {
  private static getSecrets(env: CloudflareEnv) {
    const accessSecret = env.JWT_ACCESS_SECRET
    const refreshSecret = env.JWT_REFRESH_SECRET

    if (!accessSecret || !refreshSecret) {
      throw new JWTConfigurationError()
    }

    return { accessSecret, refreshSecret }
  }

  static async generateTokenPair(userId: string, username: string, env: CloudflareEnv): Promise<TokenPair> {
    const { accessSecret, refreshSecret } = this.getSecrets(env)

    const now = Math.floor(Date.now() / 1000)
    const accessExpiresIn = parseInt(env.JWT_ACCESS_EXPIRES_IN || '900') // 15 minutes default
    const refreshExpiresIn = parseInt(env.JWT_REFRESH_EXPIRES_IN || '604800') // 7 days default

    const payload: JWTPayload = {
      userId,
      username,
      iat: now,
      exp: now + accessExpiresIn
    }

    const refreshPayload: JWTPayload = {
      userId,
      username,
      iat: now,
      exp: now + refreshExpiresIn
    }

    const accessToken = await jwt.sign(payload, accessSecret)
    const refreshToken = await jwt.sign(refreshPayload, refreshSecret)

    return { accessToken, refreshToken }
  }

  static async verifyAccessToken(token: string, env: CloudflareEnv): Promise<JWTPayload | null> {
    // Read the secret OUTSIDE the try: null means "this token is not valid", and a
    // configuration failure must not be able to say that.
    const { accessSecret } = this.getSecrets(env)

    try {
      const isValid = await jwt.verify(token, accessSecret)

      if (!isValid) {
        return null
      }

      const decoded = jwt.decode(token)
      return decoded.payload as JWTPayload
    } catch {
      return null
    }
  }

  static async verifyRefreshToken(token: string, env: CloudflareEnv): Promise<JWTPayload | null> {
    // Read the secret OUTSIDE the try: null means "this token is not valid", and a
    // configuration failure must not be able to say that.
    const { refreshSecret } = this.getSecrets(env)

    try {
      const isValid = await jwt.verify(token, refreshSecret)

      if (!isValid) {
        return null
      }

      const decoded = jwt.decode(token)
      return decoded.payload as JWTPayload
    } catch {
      return null
    }
  }

  static getCookieOptions(isRefreshToken = false, env?: { ENVIRONMENT?: string }) {
    const maxAge = isRefreshToken ? 7 * 24 * 60 * 60 : 15 * 60 // 7 days or 15 minutes
    const isDevelopment = env?.ENVIRONMENT === 'development'

    return {
      httpOnly: true,
      secure: !isDevelopment, // Only secure in production
      sameSite: 'strict' as const,
      maxAge,
      path: '/',
      priority: 'high' as const
    }
  }

  static getClearCookieOptions() {
    return {
      httpOnly: true,
      secure: true,
      sameSite: 'strict' as const,
      maxAge: 0,
      path: '/',
      expires: new Date(0)
    }
  }
}
