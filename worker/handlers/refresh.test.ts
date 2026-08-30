import { describe, expect, it, vi, afterEach } from 'vitest'
import type { CloudflareEnv } from '../types/cloudflare'
import { onRequestPost } from './refresh'
import { withAuth } from '../middleware/auth'
import type { AuthenticatedRequest } from '../middleware/security'

const kv = {
  get: vi.fn(async () => null),
  put: vi.fn(async () => {}),
  delete: vi.fn(async () => {}),
}

function env(secrets: boolean): CloudflareEnv {
  const base = { MONEY_USER_AUTH: kv } as unknown as CloudflareEnv
  if (!secrets) return base
  return {
    ...base,
    JWT_ACCESS_SECRET: 'a'.repeat(40),
    JWT_REFRESH_SECRET: 'b'.repeat(40),
  } as CloudflareEnv
}

function post(cookie?: string): Request {
  return new Request('https://example.test/api/v1/refresh', {
    method: 'POST',
    headers: cookie ? { cookie } : {},
  })
}

function get(path: string, cookie?: string): AuthenticatedRequest {
  return new Request(`https://example.test${path}`, {
    headers: cookie ? { cookie } : {},
  }) as unknown as AuthenticatedRequest
}

afterEach(() => {
  vi.restoreAllMocks()
})

// A 401 is the one verdict the client treats as a definitive logout: it wipes the
// cached offline identity. "We cannot evaluate tokens right now" must therefore never
// be laundered into one, or a single mis-bound secret mass-logs-out every user.
describe('a JWT secret misconfiguration is an outage, not a rejection', () => {
  it('answers 503 on /refresh instead of 401 when the secrets are unbound', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await onRequestPost(post('refreshToken=aaa.bbb.ccc'), env(false))

    expect(response.status).toBe(503)
  })

  it('still answers 401 on /refresh for a token that is genuinely invalid', async () => {
    const response = await onRequestPost(post('refreshToken=aaa.bbb.ccc'), env(true))

    expect(response.status).toBe(401)
  })

  it('still answers 401 on /refresh when no refresh cookie was sent', async () => {
    const response = await onRequestPost(post(), env(false))

    expect(response.status).toBe(401)
  })

  it('answers 503 from withAuth instead of 401 when the secrets are unbound', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await withAuth(get('/api/v1/me', 'accessToken=aaa.bbb.ccc'), env(false))

    expect(response?.status).toBe(503)
  })

  it('still answers 401 from withAuth for an access token that is genuinely invalid', async () => {
    const response = await withAuth(get('/api/v1/me', 'accessToken=aaa.bbb.ccc'), env(true))

    expect(response?.status).toBe(401)
  })

  it('still answers 401 from withAuth when no access cookie was sent', async () => {
    const response = await withAuth(get('/api/v1/me'), env(false))

    expect(response?.status).toBe(401)
  })

  it('lets public routes through without evaluating any token', async () => {
    const response = await withAuth(get('/api/v1/signin'), env(false))

    expect(response).toBeUndefined()
  })
})
