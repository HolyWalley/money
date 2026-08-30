import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SignInForm } from './SignInForm'
import type { ConnectionState } from '@/lib/network-status'

const mocks = vi.hoisted(() => ({
  signin: vi.fn(async () => ({ success: true })),
  connection: 'online' as ConnectionState,
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ signin: mocks.signin }),
}))

vi.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => mocks.connection,
}))

function submitButton() {
  return screen.getByRole('button', { name: 'Sign In' })
}

async function fillValidCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Username'), 'qauser')
  await user.type(screen.getByLabelText('Password'), 'hunter2hunter2')
}

describe('SignInForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.connection = 'online'
  })

  it('keeps the submit button disabled until the form is valid', async () => {
    const user = userEvent.setup()
    render(<SignInForm />)

    expect(submitButton()).toBeDisabled()

    await fillValidCredentials(user)

    expect(submitButton()).toBeEnabled()
  })

  // LIVE-1: two aborted sign-ins drove the connection to 'unreachable', which the old
  // `!== 'online'` test disabled the button on. Only a successful request clears that
  // state, so the button disabled the sole thing that could re-enable it.
  it('stays submittable when the server is unreachable', async () => {
    mocks.connection = 'unreachable'
    const user = userEvent.setup()
    render(<SignInForm />)

    await fillValidCredentials(user)

    expect(submitButton()).toBeEnabled()

    await user.click(submitButton())

    expect(mocks.signin).toHaveBeenCalledWith('qauser', 'hunter2hunter2')
  })

  it('stays submittable even when the browser reports being offline', async () => {
    mocks.connection = 'offline'
    const user = userEvent.setup()
    render(<SignInForm />)

    await fillValidCredentials(user)

    expect(submitButton()).toBeEnabled()
  })

  it('does not tell an unreachable user they are offline', () => {
    mocks.connection = 'unreachable'
    render(<SignInForm />)

    expect(screen.getByText("Can't reach the server — you can still try")).toBeInTheDocument()
    expect(screen.queryByText("You're offline")).not.toBeInTheDocument()
  })

  it('says the user is offline when the browser genuinely is', () => {
    mocks.connection = 'offline'
    render(<SignInForm />)

    expect(screen.getByText("You're offline")).toBeInTheDocument()
  })

  it('shows no connection note while online', () => {
    render(<SignInForm />)

    expect(screen.queryByText("You're offline")).not.toBeInTheDocument()
    expect(screen.queryByText("Can't reach the server — you can still try")).not.toBeInTheDocument()
  })

  it('surfaces the humanised failure returned by signin', async () => {
    mocks.signin.mockResolvedValueOnce({
      success: false,
      error: "Can't reach the server. Check your connection and try again.",
    } as never)
    const user = userEvent.setup()
    render(<SignInForm />)

    await fillValidCredentials(user)
    await user.click(submitButton())

    expect(
      await screen.findByText("Can't reach the server. Check your connection and try again."),
    ).toBeInTheDocument()
    expect(submitButton()).toBeEnabled()
  })
})
