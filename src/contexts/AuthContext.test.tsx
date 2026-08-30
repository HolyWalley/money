import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  AUTH_REVERIFY_FAILURE_MIN_INTERVAL_MS,
  AUTH_REVERIFY_MIN_INTERVAL_MS,
  AuthProvider,
  useAuth,
  type User
} from './AuthContext'
import type { ApiFailure, ApiResponse } from '@/lib/api-client'

const mocks = vi.hoisted(() => ({
  checkAuth: vi.fn(),
  signin: vi.fn(),
  signup: vi.fn(),
  signout: vi.fn()
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    checkAuth: mocks.checkAuth,
    signin: mocks.signin,
    signup: mocks.signup,
    signout: mocks.signout
  },
  API_TIMEOUTS: {
    default: 10_000,
    auth: 8_000,
    syncPull: 30_000,
    syncPush: 45_000,
    syncInitialPush: 120_000,
    debug: 30_000
  }
}))

const USER_STORAGE_KEY = 'money-app-user'

const cachedUser: User = {
  userId: 'u1',
  username: 'bob',
  createdAt: '2026-01-01T00:00:00.000Z',
  premium: { active: true }
}

const serverUser: User = { ...cachedUser, username: 'bob-from-server' }

// A wider toFake list deadlocks every Dexie await under fake-indexeddb.
const FAKE_TIMER_OPTIONS: Parameters<typeof vi.useFakeTimers>[0] = {
  toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date']
}

function seedCachedUser() {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(cachedUser))
}

function deferredResponse() {
  let resolve!: (response: ApiResponse<User>) => void
  const promise = new Promise<ApiResponse<User>>(r => { resolve = r })
  return { promise, resolve }
}

function makeVisible() {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
}

function Probe() {
  const { user, sessionExpired, isLoading, signin, signout } = useAuth()
  const [signinError, setSigninError] = useState('')

  return (
    <div>
      <span data-testid="user">{user?.username ?? 'none'}</span>
      <span data-testid="expired">{String(sessionExpired)}</span>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="signin-error">{signinError}</span>
      <button
        onClick={async () => {
          const result = await signin('bob', 'secret')
          setSigninError(result.error ?? '')
        }}
      >
        do signin
      </button>
      <button onClick={() => { void signout() }}>do signout</button>
    </div>
  )
}

function renderAuth() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </MemoryRouter>
  )
}

const okResponse: ApiResponse<User> = { ok: true, status: 200, data: serverUser }

function failure(status: number, f: ApiFailure): ApiResponse<User> {
  return { ok: false, status, failure: f }
}

describe('AuthProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mocks.checkAuth.mockResolvedValue(okResponse)
    mocks.signout.mockResolvedValue({ ok: true, status: 200 })
  })

  afterEach(() => {
    vi.useRealTimers()
    // makeVisible() shadows the prototype getter with an own property.
    Reflect.deleteProperty(document, 'visibilityState')
  })

  const survivableFailures: Array<[string, ApiResponse<User>]> = [
    ['a dropped connection (status 0, network)', failure(0, 'network')],
    ['our own deadline firing (status 0, timeout)', failure(0, 'timeout')],
    ['a 408 from a proxy', failure(408, 'client')],
    ['a 429 rate limit', failure(429, 'server')],
    ['a 500 from the worker', failure(500, 'server')],
    ['a 502 bad gateway', failure(502, 'server')],
    ['a Cloudflare 522', failure(522, 'server')],
    ['an unparseable 200', failure(200, 'parse')]
  ]

  it.each(survivableFailures)('keeps the cached user and its localStorage copy on %s', async (_label, response) => {
    seedCachedUser()
    mocks.checkAuth.mockResolvedValue(response)

    renderAuth()

    await waitFor(() => expect(mocks.checkAuth).toHaveBeenCalledTimes(1))

    expect(screen.getByTestId('user')).toHaveTextContent('bob')
    expect(screen.getByTestId('expired')).toHaveTextContent('false')
    expect(localStorage.getItem(USER_STORAGE_KEY)).toBe(JSON.stringify(cachedUser))
  })

  it('clears the user and localStorage on an auth failure', async () => {
    seedCachedUser()
    mocks.checkAuth.mockResolvedValue(failure(401, 'auth'))

    renderAuth()

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('none'))
    expect(screen.getByTestId('expired')).toHaveTextContent('true')
    expect(localStorage.getItem(USER_STORAGE_KEY)).toBeNull()
  })

  it('does not report an expired session when there was never one', async () => {
    // A first-time visitor's very first /me is a 401 like any other. Treating it
    // as expiry greets everyone who has never signed in with "Your session expired".
    mocks.checkAuth.mockResolvedValue(failure(401, 'auth'))

    renderAuth()

    await waitFor(() => expect(mocks.checkAuth).toHaveBeenCalledTimes(1))

    expect(screen.getByTestId('user')).toHaveTextContent('none')
    expect(screen.getByTestId('expired')).toHaveTextContent('false')
  })

  it('adopts the server user on success', async () => {
    seedCachedUser()

    renderAuth()

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('bob-from-server'))
    expect(screen.getByTestId('expired')).toHaveTextContent('false')
    expect(localStorage.getItem(USER_STORAGE_KEY)).toBe(JSON.stringify(serverUser))
  })

  it('shows the loading state only when there is no cached user', async () => {
    mocks.checkAuth.mockReturnValue(new Promise(() => {}))

    const withoutCache = renderAuth()
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('true'))
    withoutCache.unmount()

    seedCachedUser()
    renderAuth()
    await waitFor(() => expect(mocks.checkAuth).toHaveBeenCalledTimes(2))
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
  })

  it('signin failure returns humanised copy and never clears the user', async () => {
    seedCachedUser()
    mocks.checkAuth.mockResolvedValue(failure(0, 'network'))
    mocks.signin.mockResolvedValue(failure(0, 'network'))

    const user = userEvent.setup()
    renderAuth()
    await waitFor(() => expect(mocks.checkAuth).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: 'do signin' }))

    await waitFor(() =>
      expect(screen.getByTestId('signin-error')).toHaveTextContent(
        "Can't reach the server. Check your connection and try again."
      )
    )
    expect(screen.getByTestId('user')).toHaveTextContent('bob')
    expect(localStorage.getItem(USER_STORAGE_KEY)).toBe(JSON.stringify(cachedUser))
  })

  it('signout clears the user and localStorage', async () => {
    seedCachedUser()
    mocks.checkAuth.mockResolvedValue(failure(0, 'network'))

    const user = userEvent.setup()
    renderAuth()
    await waitFor(() => expect(mocks.checkAuth).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: 'do signout' }))

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('none'))
    expect(localStorage.getItem(USER_STORAGE_KEY)).toBeNull()
  })

  it('re-verifies silently on the online event', async () => {
    // The boot check failed, so the attempt floor - not the 10 minute success
    // window - is what stands between the two calls.
    vi.useFakeTimers(FAKE_TIMER_OPTIONS)
    seedCachedUser()
    mocks.checkAuth.mockResolvedValue(failure(0, 'network'))

    renderAuth()
    await act(async () => {})
    expect(mocks.checkAuth).toHaveBeenCalledTimes(1)

    act(() => { vi.advanceTimersByTime(AUTH_REVERIFY_FAILURE_MIN_INTERVAL_MS + 1) })
    await act(async () => { window.dispatchEvent(new Event('online')) })

    expect(mocks.checkAuth).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
  })

  it('does not re-verify twice within the 10 minute window', async () => {
    vi.useFakeTimers(FAKE_TIMER_OPTIONS)
    seedCachedUser()

    renderAuth()
    await act(async () => {})
    expect(mocks.checkAuth).toHaveBeenCalledTimes(1)

    await act(async () => { window.dispatchEvent(new Event('online')) })

    expect(mocks.checkAuth).toHaveBeenCalledTimes(1)
  })

  it('re-verifies after the 10 minute window elapses', async () => {
    vi.useFakeTimers(FAKE_TIMER_OPTIONS)
    seedCachedUser()

    renderAuth()
    await act(async () => {})
    expect(mocks.checkAuth).toHaveBeenCalledTimes(1)

    act(() => { vi.advanceTimersByTime(AUTH_REVERIFY_MIN_INTERVAL_MS + 1) })
    await act(async () => { window.dispatchEvent(new Event('online')) })

    expect(mocks.checkAuth).toHaveBeenCalledTimes(2)
  })

  it('re-verifies on visibilitychange to visible', async () => {
    vi.useFakeTimers(FAKE_TIMER_OPTIONS)
    seedCachedUser()
    mocks.checkAuth.mockResolvedValue(failure(0, 'network'))

    renderAuth()
    await act(async () => {})
    expect(mocks.checkAuth).toHaveBeenCalledTimes(1)

    makeVisible()
    act(() => { vi.advanceTimersByTime(AUTH_REVERIFY_FAILURE_MIN_INTERVAL_MS + 1) })
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })

    expect(mocks.checkAuth).toHaveBeenCalledTimes(2)
  })

  it('throttles re-verification while the server is unreachable', async () => {
    // The 10 minute window is armed only by success, so on a dead link it never
    // arms and every app-switcher pass used to launch another 8s /me.
    vi.useFakeTimers(FAKE_TIMER_OPTIONS)
    seedCachedUser()
    mocks.checkAuth.mockResolvedValue(failure(0, 'network'))

    renderAuth()
    await act(async () => {})
    expect(mocks.checkAuth).toHaveBeenCalledTimes(1)

    makeVisible()
    for (let i = 0; i < 8; i++) {
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
      await act(async () => { window.dispatchEvent(new Event('online')) })
    }

    expect(mocks.checkAuth).toHaveBeenCalledTimes(1)

    act(() => { vi.advanceTimersByTime(AUTH_REVERIFY_FAILURE_MIN_INTERVAL_MS + 1) })
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })

    expect(mocks.checkAuth).toHaveBeenCalledTimes(2)
  })

  it('coalesces re-verification while a check is still in flight', async () => {
    seedCachedUser()
    mocks.checkAuth.mockReturnValue(new Promise(() => {}))

    renderAuth()
    await waitFor(() => expect(mocks.checkAuth).toHaveBeenCalledTimes(1))

    makeVisible()
    for (let i = 0; i < 5; i++) {
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    }

    expect(mocks.checkAuth).toHaveBeenCalledTimes(1)
  })

  it('a stale /me resolving after signout cannot resurrect the identity', async () => {
    seedCachedUser()
    const boot = deferredResponse()
    mocks.checkAuth.mockReturnValue(boot.promise)

    const user = userEvent.setup()
    renderAuth()
    await waitFor(() => expect(mocks.checkAuth).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: 'do signout' }))
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('none'))

    await act(async () => { boot.resolve(okResponse) })

    expect(screen.getByTestId('user')).toHaveTextContent('none')
    expect(localStorage.getItem(USER_STORAGE_KEY)).toBeNull()
  })

  it('a stale 401 resolving after a successful signin cannot clear the new session', async () => {
    const boot = deferredResponse()
    mocks.checkAuth.mockReturnValue(boot.promise)
    mocks.signin.mockResolvedValue(okResponse)

    const user = userEvent.setup()
    renderAuth()
    await waitFor(() => expect(mocks.checkAuth).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('loading')).toHaveTextContent('true')

    await user.click(screen.getByRole('button', { name: 'do signin' }))
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('bob-from-server'))

    await act(async () => { boot.resolve(failure(401, 'auth')) })

    expect(screen.getByTestId('user')).toHaveTextContent('bob-from-server')
    expect(screen.getByTestId('expired')).toHaveTextContent('false')
    expect(localStorage.getItem(USER_STORAGE_KEY)).toBe(JSON.stringify(serverUser))
    // The dropped result must still release the spinner it raised.
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
  })

  it('invariant: setUser(null) appears exactly twice in the source', () => {
    const source = readFileSync(join(process.cwd(), 'src/contexts/AuthContext.tsx'), 'utf8')
    const occurrences = source.match(/setUser\(null\)/g) ?? []
    expect(occurrences).toHaveLength(2)
  })
})
