import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PROTECTED_ROUTE_SLOW_LABEL_MS, ProtectedRoute } from './ProtectedRoute'
import type { ConnectionState } from '@/lib/network-status'

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    isLoading: false,
    refreshAuth: vi.fn()
  },
  connection: 'online' as ConnectionState
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mocks.auth
}))

vi.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => mocks.connection
}))

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>
}

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <ProtectedRoute>
        <div>protected child</div>
      </ProtectedRoute>
      <LocationProbe />
    </MemoryRouter>
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.isAuthenticated = true
    mocks.auth.isLoading = false
    mocks.connection = 'online'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the spinner while loading and online', () => {
    mocks.auth.isLoading = true

    renderRoute()

    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByText('protected child')).not.toBeInTheDocument()
  })

  it('swaps to Still connecting after 3 seconds', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    mocks.auth.isLoading = true

    renderRoute()
    expect(screen.getByText('Loading...')).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(PROTECTED_ROUTE_SLOW_LABEL_MS) })

    expect(screen.getByText('Still connecting…')).toBeInTheDocument()
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })

  it('renders the offline alert while loading and offline', () => {
    mocks.auth.isLoading = true
    mocks.connection = 'offline'

    renderRoute()

    expect(screen.getByText("You're offline")).toBeInTheDocument()
    expect(screen.getByText('Waiting for a connection to verify your session.')).toBeInTheDocument()
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })

  it('does not claim the user is offline while loading and merely unreachable', () => {
    mocks.auth.isLoading = true
    mocks.connection = 'unreachable'

    renderRoute()

    expect(screen.getByText("Can't reach the server")).toBeInTheDocument()
    expect(screen.getByText('Your device is online but the server did not answer.')).toBeInTheDocument()
    expect(screen.queryByText("You're offline")).not.toBeInTheDocument()
    // The recovery action is the only thing that clears 'unreachable'.
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
  })

  it('the Try again button calls refreshAuth', async () => {
    mocks.auth.isLoading = true
    mocks.connection = 'offline'

    const user = userEvent.setup()
    renderRoute()

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(mocks.auth.refreshAuth).toHaveBeenCalledTimes(1)
  })

  it('redirects to /auth when not authenticated', () => {
    mocks.auth.isAuthenticated = false

    renderRoute()

    expect(screen.getByTestId('location')).toHaveTextContent('/auth')
    expect(screen.queryByText('protected child')).not.toBeInTheDocument()
  })

  it('renders children when authenticated', () => {
    renderRoute()

    expect(screen.getByText('protected child')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard')
  })

  it('does not redirect while the auth check is still running', () => {
    mocks.auth.isAuthenticated = false
    mocks.auth.isLoading = true

    renderRoute()

    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard')
  })
})
