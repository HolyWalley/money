import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Children, isValidElement, type ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReviewItem } from '@/lib/bank-import/match'
import type { BankFetchOutcome } from '@/services/bankImportService'
import type { Category } from '../../../shared/schemas/category.schema'
import type { Transaction } from '../../../shared/schemas/transaction.schema'
import type { Wallet } from '../../../shared/schemas/wallet.schema'

const wallets = [
  { _id: 'w1', name: 'mBank', currency: 'PLN' },
  { _id: 'w2', name: 'Revolut', currency: 'EUR' },
] as Wallet[]
const categories = [
  { _id: 'c1', name: 'Rent', type: 'expense' },
  { _id: 'c2', name: 'Salary', type: 'income' },
  { _id: 'c3', name: 'Misc', type: 'transfer', isDefault: true },
] as Category[]
const transactions = [{ _id: 't1', date: '2026-10-04T09:00:00.000Z' }] as Transaction[]

vi.mock('@/hooks/useLiveWallets', () => ({ useLiveWallets: () => wallets }))
vi.mock('@/hooks/useLiveCategories', () => ({ useLiveCategories: () => categories }))
vi.mock('@/hooks/useLiveTransactions', () => ({ transactionsStore: () => transactions }))
// Base UI's listbox does not open under jsdom, so the dropdown is a native
// select here, named by the trigger's label.
vi.mock('@/components/ui/select', () => {
  function triggerLabel(children: ReactNode): string | undefined {
    for (const child of Children.toArray(children)) {
      if (isValidElement<{ 'aria-label'?: string }>(child) && child.props['aria-label']) return child.props['aria-label']
    }
    return undefined
  }

  return {
    Select: ({ items, value, onValueChange, children, disabled }: {
      items?: { value: string; label: string }[]
      value?: string | null
      onValueChange?: (value: string) => void
      children?: ReactNode
      disabled?: boolean
    }) => (
      <select
        aria-label={triggerLabel(children)}
        value={value ?? ''}
        disabled={disabled}
        onChange={event => onValueChange?.(event.target.value)}
      >
        <option value="" />
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

vi.mock('sonner', () => ({ toast: vi.fn() }))
vi.mock('@/services/bankImportService', () => ({
  bankImportService: { review: vi.fn(), save: vi.fn() },
}))

import { toast } from 'sonner'
import { bankImportService } from '@/services/bankImportService'
import { BankImportDrawer } from './BankImportDrawer'

// jsdom ships no PointerEvent, and Base UI's checkbox constructs one on click.
if (!window.PointerEvent) {
  window.PointerEvent = MouseEvent as unknown as typeof window.PointerEvent
}

const review = vi.mocked(bankImportService.review)
const save = vi.mocked(bankImportService.save)

function item(overrides: Partial<ReviewItem> = {}, externalId = 'mbank:1'): ReviewItem {
  return {
    operation: {
      externalId,
      bank: 'mbank',
      account: 'mbank:12345678',
      date: '2026-10-04T11:13:00.000Z',
      direction: 'expense',
      amount: 116,
      currency: 'PLN',
      counterparty: 'ANNA NOWAK',
      title: 'CZYNSZ',
      description: 'row',
      suggestTransfer: false,
    linkedExternalIds: [],
    },
    ...overrides,
  }
}

const fetched: BankFetchOutcome = { ok: true, parsed: { operations: [], unreadable: [] } }

async function open(outcome: BankFetchOutcome = fetched, onClose = vi.fn()) {
  const request = Promise.resolve(outcome)
  await act(async () => {
    render(<BankImportDrawer request={request} onClose={onClose} />)
  })
  return onClose
}

describe('BankImportDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    review.mockReturnValue([])
    save.mockResolvedValue({ imported: 0, logged: 0 })
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

  it('renders nothing while closed', () => {
    render(<BankImportDrawer request={null} onClose={vi.fn()} />)

    expect(screen.queryByText('Bank import')).not.toBeInTheDocument()
  })

  it('shows why the notifications could not be fetched', async () => {
    await open({ ok: false, error: 'The mail provider token has expired' })

    expect(screen.getByText('The mail provider token has expired')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument()
  })

  it('says so when the bank reported nothing new', async () => {
    await open()

    expect(screen.getByText('Nothing new from your bank.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save 0' })).toBeDisabled()
  })

  it('leaves the wallet empty for an account that was never imported', async () => {
    review.mockReturnValue([item()])

    await open()

    expect(screen.getByText('ANNA NOWAK')).toBeInTheDocument()
    expect(screen.getByText('CZYNSZ')).toBeInTheDocument()
    expect(screen.getByText(/mBank …5678/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Wallet' })).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Save 0' })).toBeDisabled()
  })

  it('prefills the wallet stored for the account', async () => {
    review.mockReturnValue([item({ walletId: 'w1' })])

    await open()

    expect(screen.getByRole('combobox', { name: 'Wallet' })).toHaveValue('w1')
  })

  it('applies a wallet chosen on one row to every row of the same account', async () => {
    review.mockReturnValue([
      item(),
      item({}, 'mbank:2'),
      { operation: { ...item().operation, externalId: 'mbank:3', account: 'mbank:99999999' } },
      { operation: { ...item().operation, externalId: 'mbank:4', currency: 'EUR' } },
    ])
    const user = userEvent.setup()

    await open()
    await user.selectOptions(screen.getAllByRole('combobox', { name: 'Wallet' })[0], 'w1')

    const [first, second, otherAccount, otherCurrency] = screen.getAllByRole('combobox', { name: 'Wallet' })
    expect(first).toHaveValue('w1')
    expect(second).toHaveValue('w1')
    expect(otherAccount).toHaveValue('')
    expect(otherCurrency).toHaveValue('')
  })

  it('marks a matched operation as already logged and saves it as such', async () => {
    const matched = item({ matchedTransactionId: 't1' })
    review.mockReturnValue([matched])
    save.mockResolvedValue({ imported: 0, logged: 1 })
    const user = userEvent.setup()

    const onClose = await open()

    expect(screen.getByRole('checkbox', { name: /Already logged/ })).toBeChecked()
    expect(screen.getByText(/looks like your entry from 4 Oct/)).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Wallet' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save 1' }))

    expect(save).toHaveBeenCalledWith([{ item: matched, action: 'logged' }])
    expect(toast).toHaveBeenCalledWith('Imported 0, marked 1 as already logged')
    expect(onClose).toHaveBeenCalled()
  })

  it('lets any operation be marked as already logged, and unmarked', async () => {
    const plain = item()
    review.mockReturnValue([plain])
    const user = userEvent.setup()

    await open()
    await user.click(screen.getByRole('checkbox', { name: /Already logged/ }))

    expect(screen.queryByRole('combobox', { name: 'Wallet' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save 1' })).toBeEnabled()

    await user.click(screen.getByRole('checkbox', { name: /Already logged/ }))

    expect(screen.getByRole('combobox', { name: 'Wallet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save 0' })).toBeDisabled()
  })

  it('offers a transfer with a destination wallet and received amount for a top-up', async () => {
    review.mockReturnValue([{ operation: { ...item().operation, suggestTransfer: true } }])
    const user = userEvent.setup()

    await open()

    expect(screen.getByRole('checkbox', { name: 'Transfer to my wallet' })).toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('c3')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Wallet' }), 'w1')
    await user.selectOptions(screen.getByRole('combobox', { name: 'To wallet' }), 'w2')
    expect(screen.getByRole('button', { name: 'Save 0' })).toBeDisabled()

    await user.type(screen.getByRole('spinbutton', { name: 'Received amount' }), '27.5')

    await user.click(screen.getByRole('button', { name: 'Save 1' }))

    expect(save).toHaveBeenCalledWith([
      expect.objectContaining({
        action: 'import',
        walletId: 'w1',
        categoryId: 'c3',
        transfer: { toWalletId: 'w2', toCurrency: 'EUR', toAmount: 27.5 },
      }),
    ])
  })

  it('prefills a merged exchange with its destination wallet and received amount', async () => {
    review.mockReturnValue([
      {
        operation: { ...item().operation, suggestTransfer: true, received: { account: 'pko:73..7365', amount: 1300, currency: 'EUR' } },
        walletId: 'w1',
        toWalletId: 'w2',
      },
    ])

    await open()

    expect(screen.getByText(/→ \+1,300\.00 EUR/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'To wallet' })).toHaveValue('w2')
    expect(screen.getByRole('spinbutton', { name: 'Received amount' })).toHaveValue(1300)
    expect(screen.getByRole('button', { name: 'Save 1' })).toBeEnabled()
  })

  it('turning the transfer off clears the transfer category', async () => {
    review.mockReturnValue([{ operation: { ...item().operation, suggestTransfer: true } }])
    const user = userEvent.setup()

    await open()
    await user.click(screen.getByRole('checkbox', { name: 'Transfer to my wallet' }))

    expect(screen.queryByRole('combobox', { name: 'To wallet' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('')
  })

  it('lists the rows that could not be read', async () => {
    await open({ ok: true, parsed: { operations: [], unreadable: ['09:00 mBank: Autoryzacja karty'] } })

    expect(screen.getByText('1 row could not be read')).toBeInTheDocument()
    expect(screen.getByText('09:00 mBank: Autoryzacja karty')).toBeInTheDocument()
  })

  it('keeps the drawer open and says so when saving fails', async () => {
    review.mockReturnValue([item({ matchedTransactionId: 't1' })])
    save.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()

    const onClose = await open()
    await user.click(screen.getByRole('button', { name: 'Save 1' }))

    expect(screen.getByText('The import could not be saved')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
