import { render, screen, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthLayout } from './AuthLayout'
import type { ConnectionState } from '@/lib/network-status'

const mocks = vi.hoisted(() => ({
  auth: { sessionExpired: false, signin: vi.fn(), signup: vi.fn() },
  connection: 'online' as ConnectionState,
  pending: 0,
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mocks.auth,
}))

vi.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => mocks.connection,
}))

vi.mock('@/hooks/useSyncStatus', () => ({
  usePendingUpdateCount: () => mocks.pending,
}))

describe('AuthLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.sessionExpired = false
    mocks.connection = 'online'
    mocks.pending = 0
  })

  it('shows no banner while the connection is healthy', () => {
    render(<AuthLayout />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('tells a genuinely offline user to wait', () => {
    mocks.connection = 'offline'

    render(<AuthLayout />)

    const banner = within(screen.getByRole('alert'))
    expect(banner.getByText("You're offline")).toBeInTheDocument()
    expect(banner.getByText("Sign in once you're back online.")).toBeInTheDocument()
  })

  // LIVE-1: navigator.onLine was true throughout, so "you're offline" was a lie and
  // "once you're back online" pointed at an event that would never fire.
  it('blames the server, not the user, when the connection is merely unreachable', () => {
    mocks.connection = 'unreachable'

    render(<AuthLayout />)

    expect(screen.getByText("Can't reach the server")).toBeInTheDocument()
    expect(
      screen.getByText('Your device is online but the server did not answer. Try again.'),
    ).toBeInTheDocument()
    expect(screen.queryByText("You're offline")).not.toBeInTheDocument()
    expect(screen.queryByText("Sign in once you're back online.")).not.toBeInTheDocument()
  })

  it('keeps the sign-in button usable behind the unreachable banner', () => {
    mocks.connection = 'unreachable'

    render(<AuthLayout />)

    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument()
  })

  it('prefers the expired-session banner over any connection banner', () => {
    mocks.auth.sessionExpired = true
    mocks.connection = 'unreachable'
    mocks.pending = 2

    render(<AuthLayout />)

    expect(screen.getByText('Your session expired')).toBeInTheDocument()
    expect(
      screen.getByText('Sign in to keep syncing. 2 changes are still saved on this device.'),
    ).toBeInTheDocument()
    expect(screen.queryByText("Can't reach the server")).not.toBeInTheDocument()
  })
})
