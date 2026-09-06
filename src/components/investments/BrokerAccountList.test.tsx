import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ReactNode } from 'react'
import { Children, isValidElement } from 'react'
import { BrokerAccountList } from './BrokerAccountList'
import type { BrokerAccount } from '../../../shared/schemas/broker-account.schema'
import type { Wallet } from '../../../shared/schemas/wallet.schema'

const mocks = vi.hoisted(() => ({
  accounts: [] as BrokerAccount[],
  createBrokerAccount: vi.fn(async () => ({})),
  updateBrokerAccount: vi.fn(async () => ({})),
  deleteBrokerAccount: vi.fn(async () => undefined),
  getBrokerAccountTradeCount: vi.fn(async () => 0),
}))

vi.mock('@/services/investmentService', () => ({
  investmentService: {
    createBrokerAccount: mocks.createBrokerAccount,
    updateBrokerAccount: mocks.updateBrokerAccount,
    deleteBrokerAccount: mocks.deleteBrokerAccount,
    getBrokerAccountTradeCount: mocks.getBrokerAccountTradeCount,
  },
}))

vi.mock('@/hooks/useLiveBrokerAccounts', () => ({
  useLiveBrokerAccounts: () => ({ brokerAccounts: mocks.accounts, isLoading: false }),
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
  useLiveWallets: () => ({ wallets, isLoading: false }),
}))

// The real select is a Base UI popup; a native one keeps the dialog's label
// wiring readable from a test.
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

function renderList(accounts: BrokerAccount[], onImport = vi.fn()) {
  mocks.accounts = accounts
  render(<BrokerAccountList onImport={onImport} />)
  return { onImport }
}

/** The list is folded away until it is asked for, so everything in it is a click behind the trigger. */
async function expandList(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Broker accounts/ }))
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, accountName: string) {
  await expandList(user)
  await user.click(await screen.findByRole('button', { name: `Open ${accountName} menu` }))
}

describe('BrokerAccountList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getBrokerAccountTradeCount.mockResolvedValue(0)
  })

  it('invites the first account when there are none', () => {
    renderList([])

    expect(screen.getByText('No broker accounts yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add Account/ })).toBeInTheDocument()
  })

  // Set up once and then only ever corrected, so the list stays out of the way
  // of the holdings until someone asks for it.
  it('keeps the accounts folded away behind their count', () => {
    renderList([
      makeAccount({ cashWalletId: 'w-cash' }),
      makeAccount({ _id: 'acc-2', name: 'Revolut Invest', broker: 'revolut' }),
    ])

    expect(screen.getByRole('button', { name: /Broker accounts/ })).toHaveTextContent('(2)')
    expect(screen.queryByText('DEGIRO Custody')).not.toBeInTheDocument()
  })

  it('shows each account with its broker and the wallet its cash sits in', async () => {
    const user = userEvent.setup()
    renderList([
      makeAccount({ cashWalletId: 'w-cash' }),
      makeAccount({ _id: 'acc-2', name: 'Revolut Invest', broker: 'revolut' }),
    ])
    await expandList(user)

    expect(screen.getByText('DEGIRO Custody')).toBeInTheDocument()
    expect(screen.getByText('DEGIRO')).toBeInTheDocument()
    expect(screen.getByText('DEGIRO cash (EUR)')).toBeInTheDocument()

    expect(screen.getByText('Revolut Invest')).toBeInTheDocument()
    expect(screen.getByText('Revolut')).toBeInTheDocument()
    expect(screen.getByText('No cash wallet linked')).toBeInTheDocument()
  })

  // The portfolio's own import button reads the broker off the file, so this
  // one only exists for the account the file cannot pick by itself.
  it('hands the account over when an import is started from its menu', async () => {
    const user = userEvent.setup()
    const account = makeAccount()
    const { onImport } = renderList([account])

    await openMenu(user, 'DEGIRO Custody')
    await user.click(await screen.findByRole('menuitem', { name: 'Import statement' }))

    expect(onImport).toHaveBeenCalledWith(account)
  })

  it('creates an account from the empty state', async () => {
    const user = userEvent.setup()
    renderList([])

    await user.click(screen.getByRole('button', { name: /Add Account/ }))
    await user.type(await screen.findByLabelText('Name'), 'Revolut Invest')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(mocks.createBrokerAccount).toHaveBeenCalledWith({
      name: 'Revolut Invest',
      broker: 'degiro',
      cashWalletId: undefined,
    }))
  })

  it('edits an account from its menu, prefilled with what it holds', async () => {
    const user = userEvent.setup()
    renderList([makeAccount({ cashWalletId: 'w-cash' })])

    await openMenu(user, 'DEGIRO Custody')
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }))

    expect(await screen.findByLabelText('Name')).toHaveValue('DEGIRO Custody')
    expect(screen.getByLabelText('Cash wallet (optional)')).toHaveValue('w-cash')

    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'DEGIRO Basic')
    await user.click(screen.getByRole('button', { name: 'Update' }))

    await waitFor(() => expect(mocks.updateBrokerAccount).toHaveBeenCalledWith('acc-1', {
      name: 'DEGIRO Basic',
      broker: 'degiro',
      cashWalletId: 'w-cash',
    }))
  })

  it('warns how many imported trades a delete takes with it', async () => {
    const user = userEvent.setup()
    mocks.getBrokerAccountTradeCount.mockResolvedValue(42)
    renderList([makeAccount()])

    await openMenu(user, 'DEGIRO Custody')
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))

    expect(await screen.findByText(/42 imported trades/)).toBeInTheDocument()
    expect(screen.getByText(/instruments they refer to are kept/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete account & trades' }))

    await waitFor(() => expect(mocks.deleteBrokerAccount).toHaveBeenCalledWith('acc-1'))
  })

  it('says an account is empty when it has no imported trades', async () => {
    const user = userEvent.setup()
    renderList([makeAccount()])

    await openMenu(user, 'DEGIRO Custody')
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))

    expect(await screen.findByText(/has no imported trades/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeInTheDocument()
  })

  it('keeps the account when the delete is cancelled', async () => {
    const user = userEvent.setup()
    renderList([makeAccount()])

    await openMenu(user, 'DEGIRO Custody')
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(mocks.deleteBrokerAccount).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText(/has no imported trades/)).not.toBeInTheDocument())
  })

  it('offers the next account from the list once one exists', async () => {
    const user = userEvent.setup()
    renderList([makeAccount()])
    await expandList(user)

    await user.click(screen.getByRole('button', { name: /Add Account/ }))

    expect(await screen.findByText('Add Broker Account')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('')
  })

  // Nothing clears cashWalletId when the wallet itself is deleted, so a card
  // has to survive pointing at a wallet that is gone.
  it('says so when the linked cash wallet no longer exists', async () => {
    const user = userEvent.setup()
    renderList([makeAccount({ cashWalletId: 'w-deleted' })])
    await expandList(user)

    expect(screen.getByText('Unknown Wallet')).toBeInTheDocument()
  })

  it('still warns about the trades when their count cannot be read', async () => {
    const user = userEvent.setup()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.getBrokerAccountTradeCount.mockRejectedValue(new Error('database is gone'))
    renderList([makeAccount()])

    await openMenu(user, 'DEGIRO Custody')
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))

    expect(await screen.findByText(/deletes every trade imported into it/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete account & trades' }))

    await waitFor(() => expect(mocks.deleteBrokerAccount).toHaveBeenCalledWith('acc-1'))
  })

  it('starts the next account from a clean form after one is abandoned', async () => {
    const user = userEvent.setup()
    renderList([])

    await user.click(screen.getByRole('button', { name: /Add Account/ }))
    await user.type(await screen.findByLabelText('Name'), 'Half typed')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await user.click(screen.getByRole('button', { name: /Add Account/ }))

    expect(await screen.findByLabelText('Name')).toHaveValue('')
  })
})
