import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiClient, isRetryableFailure } from './api-client'
import { getConnectionState, resetNetworkStatus } from './network-status'

const USER = {
  userId: 'user-1',
  username: 'tester',
  createdAt: '2026-01-01T00:00:00.000Z',
  premium: { active: false },
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

const html = (status = 200) =>
  new Response('<!doctype html><html><body>Sign in to the WiFi</body></html>', {
    status,
    headers: { 'content-type': 'text/html' },
  })

const userEnvelope = () => json({ success: true, data: { user: USER } })

/** A response whose body never arrives until the request is aborted. */
const stalledBody = (signal: AbortSignal) => {
  const response = json({ success: true, data: { user: USER } })
  Object.defineProperty(response, 'json', {
    value: () => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }),
  })
  return response
}

/** A fetch that never resolves until the request is aborted. */
const neverArrives = (signal: AbortSignal) =>
  new Promise<Response>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  })

let fetchMock: ReturnType<typeof vi.fn>

const urlsOf = () => fetchMock.mock.calls.map(call => String(call[0]))

const useTimers = () =>
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  resetNetworkStatus()
})

describe('isRetryableFailure', () => {
  it('is true for transport and server failures', () => {
    expect(isRetryableFailure('network')).toBe(true)
    expect(isRetryableFailure('timeout')).toBe(true)
    expect(isRetryableFailure('server')).toBe(true)
    expect(isRetryableFailure('parse')).toBe(true)
  })

  it('is false for auth, client and success', () => {
    expect(isRetryableFailure('auth')).toBe(false)
    expect(isRetryableFailure('client')).toBe(false)
    expect(isRetryableFailure(undefined)).toBe(false)
  })
})

describe('api-client classification', () => {
  it('returns network failure when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    const result = await apiClient.checkAuth()

    expect(result).toMatchObject({ ok: false, status: 0, failure: 'network' })
  })

  it('returns server failure for a Cloudflare 522 HTML page', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 522 }))

    const result = await apiClient.checkAuth()

    expect(result).toMatchObject({ ok: false, status: 522, failure: 'server' })
  })

  it('returns server failure for a 429', async () => {
    fetchMock.mockResolvedValue(json({ success: false, error: 'Too many requests' }, 429))

    const result = await apiClient.checkAuth()

    expect(result.failure).toBe('server')
  })

  it('parses Retry-After seconds into retryAfterMs', async () => {
    fetchMock.mockResolvedValue(json({ success: false }, 429, { 'retry-after': '12' }))

    const result = await apiClient.checkAuth()

    expect(result.retryAfterMs).toBe(12000)
  })

  it('clamps an absurd Retry-After to 120000', async () => {
    fetchMock.mockResolvedValue(json({ success: false }, 429, { 'retry-after': '86400' }))

    const result = await apiClient.checkAuth()

    expect(result.retryAfterMs).toBe(120000)
  })

  it('ignores an HTTP-date Retry-After', async () => {
    fetchMock.mockResolvedValue(
      json({ success: false }, 503, { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' })
    )

    const result = await apiClient.checkAuth()

    expect(result.retryAfterMs).toBeUndefined()
    expect(result.failure).toBe('server')
  })

  it('returns parse failure for a truncated JSON body', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"success":true,"data":', { status: 200, headers: { 'content-type': 'application/json' } })
    )

    const result = await apiClient.checkAuth()

    expect(result).toMatchObject({ ok: false, status: 200, failure: 'parse' })
  })

  it('returns parse failure for a 200 with an HTML body', async () => {
    fetchMock.mockResolvedValue(html())

    const result = await apiClient.checkAuth()

    expect(result).toMatchObject({ ok: false, status: 200, failure: 'parse' })
  })

  it('returns ok for a 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    const result = await apiClient.signout()

    expect(result).toMatchObject({ ok: true, status: 204 })
    expect(result.failure).toBeUndefined()
  })

  it('treats a success envelope with a falsy data payload as a success', async () => {
    fetchMock.mockResolvedValue(json({ success: true, data: 0 }))

    const result = await apiClient.getDebugInfo()

    expect(result.ok).toBe(true)
    expect(result.failure).toBeUndefined()
  })

  it('returns client failure for a success:false envelope on a 200', async () => {
    fetchMock.mockResolvedValue(json({ success: false, error: 'Nope' }))

    const result = await apiClient.checkAuth()

    expect(result).toMatchObject({ ok: false, status: 200, failure: 'client', error: 'Nope' })
  })

  it('returns client failure for a 422', async () => {
    fetchMock.mockResolvedValue(json({ success: false, error: 'Too many updates' }, 422))

    const result = await apiClient.pushSync([])

    expect(result).toMatchObject({ status: 422, failure: 'client' })
  })
})

describe('api-client refresh handling', () => {
  it('retries the original request after a successful refresh', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ success: false, error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(json({ success: true }))
      .mockResolvedValueOnce(userEnvelope())

    const result = await apiClient.checkAuth()

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(urlsOf()[1]).toBe('/api/v1/refresh')
  })

  it('emits auth failure when the refresh returns 401 JSON', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ success: false, error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(json({ success: false, error: 'Refresh token not found' }, 401))

    const result = await apiClient.checkAuth()

    expect(result).toMatchObject({ ok: false, status: 401, failure: 'auth' })
  })

  it('emits auth failure when the post-refresh retry is also 401 JSON', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ success: false, error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(json({ success: true }))
      .mockResolvedValueOnce(json({ success: false, error: 'Unauthorized' }, 401))

    const result = await apiClient.checkAuth()

    expect(result.failure).toBe('auth')
  })

  it('does NOT emit auth failure when the refresh returns 503 (logout regression guard)', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ success: false, error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(json({ success: false, error: 'Service temporarily unavailable' }, 503))

    const result = await apiClient.checkAuth()

    expect(result.failure).not.toBe('auth')
    expect(result.status).not.toBe(401)
    expect(result).toMatchObject({ ok: false, status: 0, failure: 'network' })
  })

  it('does NOT emit auth failure when the refresh rejects', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ success: false, error: 'Unauthorized' }, 401))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const result = await apiClient.checkAuth()

    expect(result.failure).not.toBe('auth')
    expect(result.status).not.toBe(401)
    expect(result).toMatchObject({ status: 0, failure: 'network' })
  })

  it('does NOT emit auth failure when the refresh returns 429', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ success: false, error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(json({ success: false, error: 'Too many requests' }, 429))

    const result = await apiClient.checkAuth()

    expect(result.failure).not.toBe('auth')
    expect(result).toMatchObject({ status: 0, failure: 'network' })
  })

  it('does NOT emit auth failure when the refresh returns 403', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ success: false, error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(json({ success: false, error: 'Request blocked' }, 403))

    const result = await apiClient.checkAuth()

    expect(result.failure).not.toBe('auth')
    expect(result).toMatchObject({ status: 0, failure: 'network' })
  })

  it('does NOT emit auth failure when the refresh returns 200 with a non-JSON body', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ success: false, error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(html(401))

    const result = await apiClient.checkAuth()

    expect(result.failure).not.toBe('auth')
    expect(result).toMatchObject({ status: 0, failure: 'network' })
  })

  it('treats a refresh 200 with {success:true} and no data as refreshed', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ success: false, error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(json({ success: true }))
      .mockResolvedValueOnce(userEnvelope())

    const result = await apiClient.checkAuth()

    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({ userId: 'user-1' })
  })

  it('does not attempt a refresh for /signin', async () => {
    fetchMock.mockResolvedValue(json({ success: false, error: 'Invalid credentials' }, 401))

    const result = await apiClient.signin('tester', 'nope')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ status: 401, failure: 'auth' })
  })

  it('does not attempt a refresh for /signup', async () => {
    fetchMock.mockResolvedValue(json({ success: false, error: 'Invalid credentials' }, 401))

    const result = await apiClient.signup('tester', 'nope')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ status: 401, failure: 'auth' })
  })

  it('dedupes concurrent refreshes', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/v1/refresh') return Promise.resolve(json({ success: true }))
      if (fetchMock.mock.calls.filter(call => call[0] === url).length === 1) {
        return Promise.resolve(json({ success: false, error: 'Unauthorized' }, 401))
      }
      return Promise.resolve(json({ success: true, data: { user: USER, updates: [] } }))
    })

    await Promise.all([apiClient.checkAuth(), apiClient.pullSync()])

    expect(urlsOf().filter(url => url === '/api/v1/refresh')).toHaveLength(1)
  })
})

describe('api-client deadlines', () => {
  it('times out when the response never arrives', async () => {
    useTimers()
    fetchMock.mockImplementation((_url: string, init: RequestInit) => neverArrives(init.signal!))

    const pending = apiClient.checkAuth()
    await vi.advanceTimersByTimeAsync(8000)

    expect(await pending).toMatchObject({ ok: false, status: 0, failure: 'timeout' })
  })

  it('times out when the BODY stalls', async () => {
    useTimers()
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      Promise.resolve(stalledBody(init.signal!))
    )

    const pending = apiClient.checkAuth()
    await vi.advanceTimersByTimeAsync(8000)

    expect(await pending).toMatchObject({ ok: false, status: 0, failure: 'timeout' })
  })

  it('clears the deadline on a fast success', async () => {
    useTimers()
    fetchMock.mockResolvedValue(userEnvelope())

    const result = await apiClient.checkAuth()
    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(120000)

    expect(result.ok).toBe(true)
    expect(result.failure).toBeUndefined()
  })

  it('gives pullSync a longer deadline than checkAuth', async () => {
    useTimers()
    fetchMock.mockImplementation((_url: string, init: RequestInit) => neverArrives(init.signal!))

    const auth = apiClient.checkAuth()
    let authSettled = false
    void auth.then(() => { authSettled = true })
    await vi.advanceTimersByTimeAsync(7999)
    expect(authSettled).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    expect((await auth).failure).toBe('timeout')

    const pull = apiClient.pullSync()
    let pullSettled = false
    void pull.then(() => { pullSettled = true })
    await vi.advanceTimersByTimeAsync(29000)
    expect(pullSettled).toBe(false)
    await vi.advanceTimersByTimeAsync(1001)
    expect((await pull).failure).toBe('timeout')
  })

  it('does not deadline importDatabaseDump', async () => {
    useTimers()
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}))
    const file = { text: () => Promise.resolve('{}\n') } as unknown as File

    const pending = apiClient.importDatabaseDump(file)
    let settled = false
    void pending.then(() => { settled = true })

    await vi.advanceTimersByTimeAsync(300000)

    expect(settled).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('gives the 401 retry a fresh full deadline', async () => {
    useTimers()
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (url === '/api/v1/refresh') {
        return new Promise<Response>(resolve => {
          setTimeout(() => resolve(json({ success: true })), 5000)
        })
      }
      if (fetchMock.mock.calls.filter(call => call[0] === url).length === 1) {
        return Promise.resolve(json({ success: false, error: 'Unauthorized' }, 401))
      }
      return neverArrives(init.signal!)
    })

    const pending = apiClient.checkAuth()
    let settled = false
    void pending.then(() => { settled = true })

    await vi.advanceTimersByTimeAsync(5000)
    await vi.advanceTimersByTimeAsync(7999)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(2)
    expect((await pending).failure).toBe('timeout')
  })
})

describe('api-client query building', () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(json({ success: true, data: { updates: [] } }))
  })

  it('sends sinceId when given', async () => {
    await apiClient.pullSync({ sinceId: 42 })

    expect(urlsOf()[0]).toBe('/api/v1/sync?sinceId=42')
  })

  it('sends since when only since is given', async () => {
    await apiClient.pullSync({ since: 5 })

    expect(urlsOf()[0]).toBe('/api/v1/sync?since=5')
  })

  it('prefers sinceId when both are given', async () => {
    await apiClient.pullSync({ sinceId: 42, since: 5 })

    expect(urlsOf()[0]).toBe('/api/v1/sync?sinceId=42')
  })

  it('sends a bare /sync with no query', async () => {
    await apiClient.pullSync()

    expect(urlsOf()[0]).toBe('/api/v1/sync')
  })

  it('pushSync sends the array verbatim as the JSON body', async () => {
    const updates = [{ update: 'AAEC', timestamp: 1, deviceId: 'device-1' }]

    await apiClient.pushSync(updates)

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('PUT')
    expect(init.body).toBe(JSON.stringify(updates))
  })
})

describe('api-client connectivity reporting', () => {
  it('two consecutive transport failures drive the connection to unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await apiClient.checkAuth()
    expect(getConnectionState()).toBe('online')
    await apiClient.checkAuth()

    expect(getConnectionState()).toBe('unreachable')
  })

  it('a 500 leaves the connection online', async () => {
    fetchMock.mockResolvedValue(json({ success: false, error: 'Boom' }, 500))

    await apiClient.checkAuth()
    await apiClient.checkAuth()

    expect(getConnectionState()).toBe('online')
  })

  it('a 429 leaves the connection online', async () => {
    fetchMock.mockResolvedValue(json({ success: false, error: 'Slow down' }, 429))

    await apiClient.checkAuth()
    await apiClient.checkAuth()

    expect(getConnectionState()).toBe('online')
  })

  it('a 200 HTML response counts toward unreachable', async () => {
    fetchMock.mockResolvedValue(html())

    await apiClient.checkAuth()
    await apiClient.checkAuth()

    expect(getConnectionState()).toBe('unreachable')
  })
})
