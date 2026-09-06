import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ReactNode } from 'react'
import { Children, isValidElement, useState } from 'react'
import { BrokerAccountDialog } from './BrokerAccountDialog'
import type { BrokerAccount } from '../../../shared/schemas/broker-account.schema'
import type { Wallet } from '../../../shared/schemas/wallet.schema'

const mocks = vi.hoisted(() => ({
  createBrokerAccount: vi.fn(async () => ({})),
  updateBrokerAccount: vi.fn(async () => ({})),
}))

vi.mock('@/services/investmentService', () => ({
  investmentService: {
    createBrokerAccount: mocks.createBrokerAccount,
    updateBrokerAccount: mocks.updateBrokerAccount,
  },
}))

const wallets: Wallet[] = [
  {
    _id: 'w-cash',
    type: 'wallet',
    name: 'DEGIRO cash',
    currency: 'EUR',
    initialBalance: 0,
    isSavings: false,
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

vi.mock('@/hooks/useLiveWallets', () => ({
  useLiveWallets: () => wallets,
}))

// The real select is a Base UI popup; a native one keeps the label wiring and
// lets the test pick a value directly.
vi.mock('@/components/ui/select', () => {
  function triggerId(children: ReactNode): string | undefined {
    for (const child of Children.toArray(children)) {
      if (isValidElement<{ id?: string }>(child) && child.props.id) return child.props.id
    }
    return undefined
  }

  return {
    Select: ({ items, value, onValueChange, children, disabled }: {
      items?: { value: string; label: string }[]
      value?: string
      onValueChange?: (value: string) => void
      children?: ReactNode
      disabled?: boolean
    }) => (
      <select
        id={triggerId(children)}
        value={value ?? ''}
        disabled={disabled}
        onChange={event => onValueChange?.(event.target.value)}
      >
        {(items ?? []).map(item => (
          <option key={item.value} value={item.value}>{item.label}</option>
        ))}
      </select>
    ),
    SelectTrigger: () => null,
    SelectContent: () => null,
    SelectItem: () => null,
    SelectValue: () => null,
  }
})

function makeAccount(overrides: Partial<BrokerAccount> = {}): BrokerAccount {
  return {
    _id: 'acc-1',
    type: 'brokerAccount',
    name: 'DEGIRO Custody',
    broker: 'degiro',
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderDialog(account: BrokerAccount | null, onOpenChange = vi.fn()) {
  render(<BrokerAccountDialog open onOpenChange={onOpenChange} account={account} />)
  return { onOpenChange }
}

describe('BrokerAccountDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates an account with the name and broker given, and no cash wallet', async () => {
    const user = userEvent.setup()
    const { onOpenChange } = renderDialog(null)

    await user.type(screen.getByLabelText('Name'), 'Revolut Invest')
    await user.selectOptions(screen.getByLabelText('Broker'), 'revolut')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(mocks.createBrokerAccount).toHaveBeenCalledTimes(1))
    expect(mocks.createBrokerAccount).toHaveBeenCalledWith({
      name: 'Revolut Invest',
      broker: 'revolut',
      cashWalletId: undefined,
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('creates an account linked to the wallet its cash sits in', async () => {
    const user = userEvent.setup()
    renderDialog(null)

    await user.type(screen.getByLabelText('Name'), 'DEGIRO Custody')
    await user.selectOptions(screen.getByLabelText('Cash wallet (optional)'), 'w-cash')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(mocks.createBrokerAccount).toHaveBeenCalledWith({
      name: 'DEGIRO Custody',
      broker: 'degiro',
      cashWalletId: 'w-cash',
    }))
  })

  it('reports a missing name instead of saving', async () => {
    const user = userEvent.setup()
    renderDialog(null)

    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText('Account name is required')).toBeInTheDocument()
    expect(mocks.createBrokerAccount).not.toHaveBeenCalled()
  })

  it('loads the account being edited into the form', () => {
    renderDialog(makeAccount({ broker: 'revolut', cashWalletId: 'w-cash' }))

    expect(screen.getByLabelText('Name')).toHaveValue('DEGIRO Custody')
    expect(screen.getByLabelText('Broker')).toHaveValue('revolut')
    expect(screen.getByLabelText('Cash wallet (optional)')).toHaveValue('w-cash')
  })

  it('renames an account without touching its cash wallet link', async () => {
    const user = userEvent.setup()
    renderDialog(makeAccount({ cashWalletId: 'w-cash' }))

    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'DEGIRO Basic')
    await user.click(screen.getByRole('button', { name: 'Update' }))

    await waitFor(() => expect(mocks.updateBrokerAccount).toHaveBeenCalledWith('acc-1', {
      name: 'DEGIRO Basic',
      broker: 'degiro',
      cashWalletId: 'w-cash',
    }))
  })

  // The CRDT tells "leave the link alone" from "clear it" by whether the key is
  // there at all, so an unlink has to send the key with no value.
  it('unlinks the cash wallet by sending the key with no value', async () => {
    const user = userEvent.setup()
    renderDialog(makeAccount({ cashWalletId: 'w-cash' }))

    await user.selectOptions(screen.getByLabelText('Cash wallet (optional)'), 'none')
    await user.click(screen.getByRole('button', { name: 'Update' }))

    await waitFor(() => expect(mocks.updateBrokerAccount).toHaveBeenCalledTimes(1))
    const [id, updates] = mocks.updateBrokerAccount.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(id).toBe('acc-1')
    expect(Object.prototype.hasOwnProperty.call(updates, 'cashWalletId')).toBe(true)
    expect(updates.cashWalletId).toBeUndefined()
  })

  it('keeps the dialog open and shows why when saving fails', async () => {
    const user = userEvent.setup()
    mocks.updateBrokerAccount.mockRejectedValueOnce(new Error('Broker account not found'))
    const { onOpenChange } = renderDialog(makeAccount())

    await user.click(screen.getByRole('button', { name: 'Update' }))

    expect(await screen.findByText('Broker account not found')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  // The dialog is reused for every "Add account", so the next attempt must not
  // open onto the last one's message.
  it('drops a failed save message when it is opened again', async () => {
    const user = userEvent.setup()
    mocks.createBrokerAccount.mockRejectedValueOnce(new Error('Broker account not saved'))

    function Host() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button onClick={() => setOpen(true)}>Reopen</button>
          <BrokerAccountDialog open={open} onOpenChange={setOpen} account={null} />
        </>
      )
    }

    render(<Host />)

    await user.type(screen.getByLabelText('Name'), 'Revolut Invest')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(await screen.findByText('Broker account not saved')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Reopen' }))

    expect(await screen.findByLabelText('Name')).toHaveValue('')
    expect(screen.queryByText('Broker account not saved')).not.toBeInTheDocument()
  })
})
