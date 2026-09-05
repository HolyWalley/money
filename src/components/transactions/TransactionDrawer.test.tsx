import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { useFormContext } from 'react-hook-form'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TransactionDrawer } from './TransactionDrawer'
import { formDefaults } from '@/lib/form-defaults'
import type { CreateTransaction, Transaction } from '../../../shared/schemas/transaction.schema'

const mocks = vi.hoisted(() => ({
  user: { settings: { defaultCurrency: 'USD' } },
  wallets: [
    { _id: 'w1', name: 'Cash', currency: 'USD' },
    { _id: 'w2', name: 'Revolut', currency: 'EUR' },
  ],
  toast: { success: vi.fn() },
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user }),
}))

vi.mock('@/hooks/useLiveWallets', () => ({
  useLiveWallets: () => ({ wallets: mocks.wallets, isLoading: false }),
}))

vi.mock('sonner', () => ({ toast: mocks.toast }))

// The real form pulls in wallets, categories and balances; this drawer's job is
// the save modes, so the fields are stood in for by the two that drive them.
vi.mock('./TransactionForm', () => ({
  TransactionForm: ({ autoFocusAmount }: { autoFocusAmount?: boolean }) => {
    const form = useFormContext<CreateTransaction>()
    const amount = form.watch('amount')

    useEffect(() => {
      form.setValue('categoryId', 'c1')
    }, [form])

    return (
      <div>
        <input
          aria-label="Amount"
          autoFocus={autoFocusAmount}
          value={amount ?? ''}
          onChange={event => form.setValue('amount', Number(event.target.value))}
        />
        <span data-testid="wallet">{form.watch('walletId')}</span>
      </div>
    )
  },
}))

function renderDrawer(props: Partial<React.ComponentProps<typeof TransactionDrawer>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  const onOpenChange = vi.fn()

  render(
    <TransactionDrawer
      open
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      {...props}
    />
  )

  return { onSubmit, onOpenChange }
}

async function enterAmount(user: ReturnType<typeof userEvent.setup>, amount: string) {
  const field = await screen.findByLabelText('Amount')
  await user.type(field, amount)
  return field
}

describe('TransactionDrawer', () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.toast.success.mockClear()
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

  it('saves and closes by default', async () => {
    const user = userEvent.setup()
    const { onSubmit, onOpenChange } = renderDrawer()

    await enterAmount(user, '12')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ amount: 12, walletId: 'w1' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('remembers the wallet of a saved transaction but not a date that is today', async () => {
    formDefaults.saveWallet('expense', { walletId: 'w2' })
    const user = userEvent.setup()
    const { onSubmit } = renderDrawer()

    await waitFor(() => expect(screen.getByTestId('wallet')).toHaveTextContent('w2'))
    await enterAmount(user, '12')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(formDefaults.loadWallet('expense')).toEqual({ walletId: 'w2', toWalletId: undefined })
    expect(formDefaults.loadDate()).toBeNull()
  })

  it('marks the current mode in the menu', async () => {
    const user = userEvent.setup()
    renderDrawer()

    await user.click(screen.getByRole('button', { name: 'Save options' }))

    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Save & add another' })).toBeInTheDocument())
    expect(screen.getByRole('menuitem', { name: 'Save' }).querySelector('svg')).not.toHaveClass('invisible')
    expect(screen.getByRole('menuitem', { name: 'Save & add another' }).querySelector('svg')).toHaveClass('invisible')
  })

  it('moves the mark once the other mode is the saved one', async () => {
    formDefaults.saveSaveMode('addAnother')
    const user = userEvent.setup()
    renderDrawer()

    await user.click(screen.getByRole('button', { name: 'Save options' }))

    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Save' })).toBeInTheDocument())
    expect(screen.getByRole('menuitem', { name: 'Save' }).querySelector('svg')).toHaveClass('invisible')
    expect(screen.getByRole('menuitem', { name: 'Save & add another' }).querySelector('svg')).not.toHaveClass('invisible')
  })

  it('saves straight away when a mode is picked from the menu', async () => {
    const user = userEvent.setup()
    const { onSubmit, onOpenChange } = renderDrawer()

    await enterAmount(user, '12')
    await user.click(screen.getByRole('button', { name: 'Save options' }))
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Save & add another' })).toBeInTheDocument())

    await user.click(screen.getByRole('menuitem', { name: 'Save & add another' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('keeps the drawer open and clears the amount after adding another', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDrawer()

    await enterAmount(user, '12')
    await user.click(screen.getByRole('button', { name: 'Save options' }))
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Save & add another' })).toBeInTheDocument())
    await user.click(screen.getByRole('menuitem', { name: 'Save & add another' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByLabelText('Amount')).toHaveValue(''))
    expect(screen.getByTestId('wallet')).toHaveTextContent('w1')
    expect(screen.getByLabelText('Amount')).toHaveFocus()
    expect(mocks.toast.success).toHaveBeenCalledWith('Saved')
  })

  it('keeps the picked mode for the next transaction', async () => {
    const user = userEvent.setup()
    renderDrawer()

    await enterAmount(user, '12')
    await user.click(screen.getByRole('button', { name: 'Save options' }))
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Save & add another' })).toBeInTheDocument())
    await user.click(screen.getByRole('menuitem', { name: 'Save & add another' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save & add another' })).toBeInTheDocument())
    expect(formDefaults.loadSaveMode()).toBe('addAnother')
  })

  it('opens on the mode saved last time', async () => {
    formDefaults.saveSaveMode('addAnother')
    renderDrawer()

    expect(await screen.findByRole('button', { name: 'Save & add another' })).toBeInTheDocument()
  })

  it('offers no modes while editing', async () => {
    const transaction = {
      _id: 't1',
      transactionType: 'expense',
      amount: 12,
      currency: 'USD',
      categoryId: 'c1',
      walletId: 'w1',
      date: '2026-01-01T00:00:00.000Z',
    } as Transaction

    renderDrawer({ transaction })

    expect(await screen.findByRole('button', { name: 'Update' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save options' })).not.toBeInTheDocument()
  })

  it('does not move the defaults when an old transaction is edited', async () => {
    formDefaults.saveWallet('expense', { walletId: 'w1' })
    const user = userEvent.setup()
    const transaction = {
      _id: 't1',
      transactionType: 'expense',
      amount: 12,
      currency: 'EUR',
      categoryId: 'c1',
      walletId: 'w2',
      date: '2026-01-01T00:00:00.000Z',
    } as Transaction

    const { onSubmit } = renderDrawer({ transaction })

    await user.click(await screen.findByRole('button', { name: 'Update' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(formDefaults.loadWallet('expense')).toEqual({ walletId: 'w1' })
    expect(formDefaults.loadDate()).toBeNull()
  })
})
