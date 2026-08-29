import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QuickFilterChips } from './QuickFilterChips'
import type { QuickFilter } from '@/contexts/FilterContext'
import type { Category } from '../../../shared/schemas/category.schema'
import type { Wallet } from '../../../shared/schemas/wallet.schema'

const wallets = [
  { _id: 'w1', name: 'Cash', currency: 'USD' },
  { _id: 'w2', name: 'Revolut', currency: 'EUR' },
] as Wallet[]

const categories = [
  { _id: 'c1', name: 'Food' },
  { _id: 'c2', name: 'Rent' },
] as Category[]

const walletFilter: QuickFilter = {
  id: 'wallet-w1',
  type: 'wallet',
  value: 'w1',
  label: 'Cash (USD)',
}

function renderChips(quickFilters: QuickFilter[], onTypeChange = vi.fn()) {
  render(
    <QuickFilterChips
      quickFilters={quickFilters}
      wallets={wallets}
      categories={categories}
      onTypeChange={onTypeChange}
      onClearAll={vi.fn()}
    />
  )
  return onTypeChange
}

describe('QuickFilterChips', () => {
  beforeEach(() => {
    // Base UI positions popovers with APIs jsdom does not implement.
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

  it('renders nothing without quick filters', () => {
    const { container } = render(
      <QuickFilterChips
        quickFilters={[]}
        wallets={wallets}
        categories={categories}
        onTypeChange={vi.fn()}
        onClearAll={vi.fn()}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows one chip per type, naming its values', () => {
    renderChips([
      walletFilter,
      { id: 'wallet-w2', type: 'wallet', value: 'w2', label: 'Revolut (EUR)' },
      { id: 'category-c1', type: 'category', value: 'c1', label: 'Food' },
    ])

    expect(screen.getByRole('button', { name: 'Edit wallet filter' }))
      .toHaveTextContent('Cash (USD), Revolut (EUR)')
    expect(screen.getByRole('button', { name: 'Edit category filter' }))
      .toHaveTextContent('Food')
  })

  it('adds a second value to an existing chip', async () => {
    const user = userEvent.setup()
    const onTypeChange = renderChips([walletFilter])

    await user.click(screen.getByRole('button', { name: 'Edit wallet filter' }))
    await waitFor(() => expect(screen.getByText('Revolut (EUR)')).toBeInTheDocument())

    await user.click(screen.getByText('Revolut (EUR)'))

    expect(onTypeChange).toHaveBeenCalledWith('wallet', [
      { value: 'w1', label: 'Cash (USD)' },
      { value: 'w2', label: 'Revolut (EUR)' },
    ])
  })

  it('removes a value that is already selected', async () => {
    const user = userEvent.setup()
    const onTypeChange = renderChips([
      walletFilter,
      { id: 'wallet-w2', type: 'wallet', value: 'w2', label: 'Revolut (EUR)' },
    ])

    await user.click(screen.getByRole('button', { name: 'Edit wallet filter' }))
    await waitFor(() => expect(screen.getByText('Cash (USD)')).toBeInTheDocument())

    await user.click(screen.getByText('Cash (USD)'))

    expect(onTypeChange).toHaveBeenCalledWith('wallet', [
      { value: 'w2', label: 'Revolut (EUR)' },
    ])
  })

  it('clears the whole type from the chip', async () => {
    const user = userEvent.setup()
    const onTypeChange = renderChips([walletFilter])

    await user.click(screen.getByRole('button', { name: 'Remove wallet filter' }))

    expect(onTypeChange).toHaveBeenCalledWith('wallet', [])
  })

  it('offers only the types that are not filtered yet', async () => {
    const user = userEvent.setup()
    renderChips([walletFilter])

    await user.click(screen.getByRole('button', { name: 'Add filter' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'category' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'type' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'wallet' })).not.toBeInTheDocument()
  })

  it('adds a new filter type through the plus button', async () => {
    const user = userEvent.setup()
    const onTypeChange = renderChips([walletFilter])

    await user.click(screen.getByRole('button', { name: 'Add filter' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'category' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'category' }))
    await waitFor(() => expect(screen.getByText('Rent')).toBeInTheDocument())

    await user.click(screen.getByText('Rent'))

    expect(onTypeChange).toHaveBeenCalledWith('category', [{ value: 'c2', label: 'Rent' }])
  })

  it('hides the plus button once every type is in use', () => {
    renderChips([
      walletFilter,
      { id: 'category-c1', type: 'category', value: 'c1', label: 'Food' },
      { id: 'transactionType-expense', type: 'transactionType', value: 'expense', label: 'Expense' },
    ])

    expect(screen.queryByRole('button', { name: 'Add filter' })).not.toBeInTheDocument()
  })

  it('selects and clears every value at once', async () => {
    const user = userEvent.setup()
    const onTypeChange = renderChips([walletFilter])

    await user.click(screen.getByRole('button', { name: 'Edit wallet filter' }))
    await waitFor(() => expect(screen.getByText('Select all')).toBeInTheDocument())

    await user.click(screen.getByText('Select all'))

    expect(onTypeChange).toHaveBeenCalledWith('wallet', [
      { value: 'w1', label: 'Cash (USD)' },
      { value: 'w2', label: 'Revolut (EUR)' },
    ])
  })
})
