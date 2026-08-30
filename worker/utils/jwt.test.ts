import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockJwt = vi.hoisted(() => ({
  sign: vi.fn(),
  verify: vi.fn(),
  decode: vi.fn(),
}))

vi.mock('@tsndr/cloudflare-worker-jwt', () => ({
  default: mockJwt,
}))

import { JWTUtils, JWTConfigurationError, isJWTConfigurationError } from './jwt'

type Env = Parameters<typeof JWTUtils.verifyRefreshToken>[1]

const envWith = (overrides: Record<string, unknown>): Env => ({
  JWT_ACCESS_SECRET: 'access-secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
  ...overrides,
} as unknown as Env)

const payload = { userId: 'u1', username: 'bob', iat: 1, exp: 2 }

describe('JWTUtils secret configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockJwt.verify.mockResolvedValue(true)
    mockJwt.decode.mockReturnValue({ payload })
  })

  it.each([
    ['missing refresh secret', { JWT_REFRESH_SECRET: undefined }],
    ['empty refresh secret', { JWT_REFRESH_SECRET: '' }],
    ['missing access secret', { JWT_ACCESS_SECRET: undefined }],
  ])('verifyRefreshToken throws JWTConfigurationError on %s instead of returning null', async (_name, overrides) => {
    await expect(JWTUtils.verifyRefreshToken('token', envWith(overrides)))
      .rejects.toBeInstanceOf(JWTConfigurationError)
    expect(mockJwt.verify).not.toHaveBeenCalled()
  })

  it('verifyAccessToken throws JWTConfigurationError when a secret is missing', async () => {
    await expect(JWTUtils.verifyAccessToken('token', envWith({ JWT_ACCESS_SECRET: undefined })))
      .rejects.toBeInstanceOf(JWTConfigurationError)
    expect(mockJwt.verify).not.toHaveBeenCalled()
  })

  it('generateTokenPair throws the same typed error, so every path is classifiable', async () => {
    await expect(JWTUtils.generateTokenPair('u1', 'bob', envWith({ JWT_REFRESH_SECRET: '' })))
      .rejects.toBeInstanceOf(JWTConfigurationError)
  })

  it('isJWTConfigurationError only recognises the configuration error', () => {
    expect(isJWTConfigurationError(new JWTConfigurationError())).toBe(true)
    expect(isJWTConfigurationError(new Error('JWT secrets not configured'))).toBe(false)
    expect(isJWTConfigurationError(null)).toBe(false)
  })
})

describe('JWTUtils token verdicts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockJwt.decode.mockReturnValue({ payload })
  })

  it.each([
    ['verifyAccessToken', (env: Env) => JWTUtils.verifyAccessToken('token', env)],
    ['verifyRefreshToken', (env: Env) => JWTUtils.verifyRefreshToken('token', env)],
  ])('%s returns the payload for a valid token', async (_name, verify) => {
    mockJwt.verify.mockResolvedValue(true)
    await expect(verify(envWith({}))).resolves.toEqual(payload)
  })

  it.each([
    ['verifyAccessToken', (env: Env) => JWTUtils.verifyAccessToken('token', env)],
    ['verifyRefreshToken', (env: Env) => JWTUtils.verifyRefreshToken('token', env)],
  ])('%s still returns null when the signature does not check out', async (_name, verify) => {
    mockJwt.verify.mockResolvedValue(false)
    await expect(verify(envWith({}))).resolves.toBeNull()
  })

  it.each([
    ['verifyAccessToken', (env: Env) => JWTUtils.verifyAccessToken('token', env)],
    ['verifyRefreshToken', (env: Env) => JWTUtils.verifyRefreshToken('token', env)],
  ])('%s still returns null when the token is malformed', async (_name, verify) => {
    mockJwt.verify.mockRejectedValue(new Error('malformed token'))
    await expect(verify(envWith({}))).resolves.toBeNull()
  })
})
