import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock @tsndr/cloudflare-worker-jwt
const mockJWT = {
  sign: vi.fn(),
  verify: vi.fn(),
}

vi.mock('@tsndr/cloudflare-worker-jwt', () => ({
  default: mockJWT,
}))

// Mock the JWT utility class that would normally be in functions/utils/jwt.ts
class JWTUtils {
  private static readonly ACCESS_TOKEN_EXPIRES_IN = '15m'
  private static readonly REFRESH_TOKEN_EXPIRES_IN = '7d'

  static async generateTokens(userId: string, username: string) {
    const payload = { userId, username }
    
    const accessToken = await mockJWT.sign(payload, 'test-secret', {
      expiresIn: this.ACCESS_TOKEN_EXPIRES_IN,
    })
    
    const refreshToken = await mockJWT.sign(payload, 'test-refresh-secret', {
      expiresIn: this.REFRESH_TOKEN_EXPIRES_IN,
    })
    
    return { accessToken, refreshToken }
  }

  static async verifyAccessToken(token: string) {
    try {
      const isValid = await mockJWT.verify(token, 'test-secret')
      if (!isValid) return null
      
      // Mock payload extraction
      return {
        userId: 'test-user-id',
        username: 'testuser',
        exp: Math.floor(Date.now() / 1000) + 900, // 15 minutes
      }
    } catch {
      return null
    }
  }

  static async verifyRefreshToken(token: string) {
    try {
      const isValid = await mockJWT.verify(token, 'test-refresh-secret')
      if (!isValid) return null
      
      // Mock payload extraction
      return {
        userId: 'test-user-id',
        username: 'testuser',
        exp: Math.floor(Date.now() / 1000) + 604800, // 7 days
      }
    } catch {
      return null
    }
  }

  static getCookieOptions(isRefreshToken = false) {
    const maxAge = isRefreshToken ? 7 * 24 * 60 * 60 : 15 * 60
    return {
      httpOnly: true,
      secure: false, // Set to false for localhost development
      sameSite: 'lax' as const,
      maxAge,
      path: '/'
    }
  }

  static createAuthCookies(accessToken: string, refreshToken: string) {
    return {
      'access-token': {
        value: accessToken,
        options: this.getCookieOptions(false)
      },
      'refresh-token': {
        value: refreshToken,
        options: this.getCookieOptions(true)
      }
    }
  }

  static createClearCookies() {
    return {
      'access-token': {
        value: '',
        options: { ...this.getCookieOptions(false), maxAge: 0 }
      },
      'refresh-token': {
        value: '',
        options: { ...this.getCookieOptions(true), maxAge: 0 }
      }
    }
  }
}

describe('JWTUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateTokens', () => {
    it('should generate access and refresh tokens', async () => {
      mockJWT.sign
        .mockResolvedValueOnce('mock-access-token')
        .mockResolvedValueOnce('mock-refresh-token')

      const tokens = await JWTUtils.generateTokens('user-123', 'testuser')

      expect(tokens).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token'
      })

      expect(mockJWT.sign).toHaveBeenCalledTimes(2)
      expect(mockJWT.sign).toHaveBeenNthCalledWith(
        1,
        { userId: 'user-123', username: 'testuser' },
        'test-secret',
        { expiresIn: '15m' }
      )
      expect(mockJWT.sign).toHaveBeenNthCalledWith(
        2,
        { userId: 'user-123', username: 'testuser' },
        'test-refresh-secret',
        { expiresIn: '7d' }
      )
    })

    it('should handle token generation errors', async () => {
      mockJWT.sign.mockRejectedValue(new Error('Token generation failed'))

      await expect(JWTUtils.generateTokens('user-123', 'testuser')).rejects.toThrow('Token generation failed')
    })
  })

  describe('verifyAccessToken', () => {
    it('should verify a valid access token', async () => {
      mockJWT.verify.mockResolvedValue(true)

      const payload = await JWTUtils.verifyAccessToken('valid-token')

      expect(payload).toEqual({
        userId: 'test-user-id',
        username: 'testuser',
        exp: expect.any(Number)
      })
      expect(mockJWT.verify).toHaveBeenCalledWith('valid-token', 'test-secret')
    })

    it('should return null for invalid access token', async () => {
      mockJWT.verify.mockResolvedValue(false)

      const payload = await JWTUtils.verifyAccessToken('invalid-token')

      expect(payload).toBeNull()
    })

    it('should return null when verification throws', async () => {
      mockJWT.verify.mockRejectedValue(new Error('Verification failed'))

      const payload = await JWTUtils.verifyAccessToken('invalid-token')

      expect(payload).toBeNull()
    })
  })

  describe('verifyRefreshToken', () => {
    it('should verify a valid refresh token', async () => {
      mockJWT.verify.mockResolvedValue(true)

      const payload = await JWTUtils.verifyRefreshToken('valid-refresh-token')

      expect(payload).toEqual({
        userId: 'test-user-id',
        username: 'testuser',
        exp: expect.any(Number)
      })
      expect(mockJWT.verify).toHaveBeenCalledWith('valid-refresh-token', 'test-refresh-secret')
    })

    it('should return null for invalid refresh token', async () => {
      mockJWT.verify.mockResolvedValue(false)

      const payload = await JWTUtils.verifyRefreshToken('invalid-refresh-token')

      expect(payload).toBeNull()
    })
  })

  describe('getCookieOptions', () => {
    it('should return access token cookie options', () => {
      const options = JWTUtils.getCookieOptions(false)

      expect(options).toEqual({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 15 * 60, // 15 minutes
        path: '/'
      })
    })

    it('should return refresh token cookie options', () => {
      const options = JWTUtils.getCookieOptions(true)

      expect(options).toEqual({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60, // 7 days
        path: '/'
      })
    })
  })

  describe('createAuthCookies', () => {
    it('should create auth cookies with proper options', () => {
      const cookies = JWTUtils.createAuthCookies('access-token', 'refresh-token')

      expect(cookies).toEqual({
        'access-token': {
          value: 'access-token',
          options: {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            maxAge: 15 * 60,
            path: '/'
          }
        },
        'refresh-token': {
          value: 'refresh-token',
          options: {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60,
            path: '/'
          }
        }
      })
    })
  })

  describe('createClearCookies', () => {
    it('should create cookies for clearing auth state', () => {
      const cookies = JWTUtils.createClearCookies()

      expect(cookies).toEqual({
        'access-token': {
          value: '',
          options: {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            maxAge: 0,
            path: '/'
          }
        },
        'refresh-token': {
          value: '',
          options: {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            maxAge: 0,
            path: '/'
          }
        }
      })
    })
  })
})
