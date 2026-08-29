import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { VirtualizedTransactionList } from './VirtualizedTransactionList'
import type { DecoratedTransaction } from '@/hooks/useDecoratedTransactions'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { settings: { defaultCurrency: 'USD' } } }),
}))

function renderList(props: Partial<React.ComponentProps<typeof VirtualizedTransactionList>> = {}) {
  const onSearchAllTime = vi.fn()

  render(
    <VirtualizedTransactionList
      transactions={[] as DecoratedTransaction[]}
      wallets={[]}
      categories={[]}
      isMobile={false}
      onSearchAllTime={onSearchAllTime}
      {...props}
    />
  )

  return { onSearchAllTime }
}

describe('VirtualizedTransactionList empty state', () => {
  it('says nothing about searching when nothing was searched for', () => {
    renderList()

    expect(screen.getByText('No transactions found')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Search the last year' })).not.toBeInTheDocument()
  })

  it('names the term that found nothing and offers to widen', async () => {
    const user = userEvent.setup()
    const { onSearchAllTime } = renderList({ searchTerm: 'coffee' })

    expect(screen.getByText(/coffee/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Search the last year' }))

    expect(onSearchAllTime).toHaveBeenCalledTimes(1)
  })

  it('offers no widening once the period is already the widest', () => {
    renderList({ searchTerm: 'coffee', onSearchAllTime: undefined })

    expect(screen.getByText(/coffee/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Search the last year' })).not.toBeInTheDocument()
  })
})
