import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SignUpForm } from './SignUpForm'
import type { ConnectionState } from '@/lib/network-status'

const mocks = vi.hoisted(() => ({
  signup: vi.fn(async () => ({ success: true })),
  connection: 'online' as ConnectionState,
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ signup: mocks.signup }),
}))

vi.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => mocks.connection,
}))

function submitButton() {
  return screen.getByRole('button', { name: 'Sign Up' })
}

async function fillValidCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Username'), 'qauser')
  await user.type(screen.getByLabelText('Password'), 'Hunter2hunter')
  await user.type(screen.getByLabelText('Confirm Password'), 'Hunter2hunter')
}

describe('SignUpForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.connection = 'online'
  })

  it('keeps the submit button disabled until the form is valid', async () => {
    const user = userEvent.setup()
    render(<SignUpForm />)

    expect(submitButton()).toBeDisabled()

    await fillValidCredentials(user)

    expect(submitButton()).toBeEnabled()
  })

  // Same lockout shape as LIVE-1: 'unreachable' clears only on a successful request.
  it('stays submittable when the server is unreachable', async () => {
    mocks.connection = 'unreachable'
    const user = userEvent.setup()
    render(<SignUpForm />)

    await fillValidCredentials(user)
    expect(submitButton()).toBeEnabled()

    await user.click(submitButton())

    expect(mocks.signup).toHaveBeenCalledTimes(1)
  })

  it('stays submittable even when the browser reports being offline', async () => {
    mocks.connection = 'offline'
    const user = userEvent.setup()
    render(<SignUpForm />)

    await fillValidCredentials(user)

    expect(submitButton()).toBeEnabled()
  })

  it('does not tell an unreachable user they are offline', () => {
    mocks.connection = 'unreachable'
    render(<SignUpForm />)

    expect(screen.getByText("Can't reach the server — you can still try")).toBeInTheDocument()
    expect(screen.queryByText("You're offline")).not.toBeInTheDocument()
  })

  it('says the user is offline when the browser genuinely is', () => {
    mocks.connection = 'offline'
    render(<SignUpForm />)

    expect(screen.getByText("You're offline")).toBeInTheDocument()
  })
})
