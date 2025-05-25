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

export class JWTUtils {
  private static getSecrets(env: CloudflareEnv) {
    const accessSecret = env.JWT_ACCESS_SECRET
    const refreshSecret = env.JWT_REFRESH_SECRET
    
    if (!accessSecret || !refreshSecret) {
      throw new Error('JWT secrets not configured')
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
    try {
      const { accessSecret } = this.getSecrets(env)
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
    try {
      const { refreshSecret } = this.getSecrets(env)
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

  static getCookieOptions(isRefreshToken = false) {
    const maxAge = isRefreshToken ? 7 * 24 * 60 * 60 : 15 * 60 // 7 days or 15 minutes
    
    return {
      httpOnly: true,
      secure: false, // Set to false for localhost development
      sameSite: 'lax' as const, // Changed from 'strict' to 'lax' for better localhost compatibility
      maxAge,
      path: '/'
    }
  }
}
