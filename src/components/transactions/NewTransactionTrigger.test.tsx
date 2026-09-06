import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { deferred, type Deferred } from '@/lib/suspense'
import { NewTransactionTrigger } from './NewTransactionTrigger'

interface Wallet {
  _id: string
  name: string
  currency: string
}

const mocks = vi.hoisted(() => ({
  wallets: null as unknown as { promise: Promise<Wallet[]> },
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { settings: { defaultCurrency: 'USD' } } }),
}))

vi.mock('@/services/transactionService', () => ({
  transactionService: { createTransaction: vi.fn() },
}))

// Reads the way the real hook does: suspends until the store answers.
vi.mock('@/hooks/useLiveWallets', async () => {
  const { use } = await import('react')
  return { useLiveWallets: () => use(mocks.wallets.promise) }
})

vi.mock('./TransactionForm', () => ({
  TransactionForm: () => <input aria-label="Amount" />,
}))

let wallets: Deferred<Wallet[]>

describe('NewTransactionTrigger', () => {
  beforeEach(() => {
    wallets = deferred<Wallet[]>()
    mocks.wallets = wallets
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  })

  // The drawer mounts its body in a render of its own, after the click has
  // committed, so nothing above it can hold the read: the drawer has to open
  // at once and wait for the wallets inside.
  it('opens the drawer at once and spins until the wallets answer', async () => {
    render(<NewTransactionTrigger />)
    const trigger = screen.getByRole('button')

    await act(async () => {
      fireEvent.click(trigger)
    })

    expect(screen.getByText('New Transaction')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument()

    await act(async () => {
      wallets.resolve([{ _id: 'w1', name: 'Cash', currency: 'USD' }])
    })

    expect(screen.getByLabelText('Amount')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps the trigger on screen when the wallets cannot be read', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    wallets.reject(new Error('index missing'))
    render(<NewTransactionTrigger />)
    const trigger = screen.getByRole('button')

    await act(async () => {
      fireEvent.click(trigger)
    })

    expect(screen.getByRole('alert')).toHaveTextContent('This could not be read')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(trigger).toBeInTheDocument()
    consoleError.mockRestore()
  })
})
