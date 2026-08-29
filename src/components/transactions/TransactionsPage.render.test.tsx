import { render, act, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '@/lib/db-dexie'

const { auth } = vi.hoisted(() => ({
  auth: { user: { settings: { defaultCurrency: 'USD' } } },
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => auth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

const { listRenders } = vi.hoisted(() => ({ listRenders: { count: 0 } }))

// react-virtualized measures to zero height in jsdom and renders no rows, so the
// real list gives us nothing to click. This stub keeps the page's own wiring
// intact while exposing a wallet click and a render counter. It is memoized like
// the real export, so a render here means a prop identity actually changed.
vi.mock('@/components/transactions/VirtualizedTransactionList', async () => {
  const { memo } = await import('react')
  return {
    VirtualizedTransactionList: memo((props: {
      transactions: { _id: string }[]
      onWalletClick?: (walletId: string, walletName: string) => void
      onSearchAllTime?: () => void
    }) => {
      listRenders.count++
      return (
        <div>
          <span data-testid="transaction-count">{props.transactions.length}</span>
          <button onClick={() => props.onWalletClick?.('w1', 'Cash')}>filter by Cash</button>
          {props.onSearchAllTime && (
            <button onClick={props.onSearchAllTime}>search the last year</button>
          )}
        </div>
      )
    }),
  }
})

const { TransactionsPage } = await import('./TransactionsPage')

const now = new Date()

beforeEach(async () => {
  localStorage.clear()
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

  await db.transactions.clear()
  await db.wallets.clear()
  await db.categories.clear()

  await db.wallets.bulkAdd([
    { _id: 'w1', name: 'Cash', currency: 'USD', initialBalance: 0, order: 0, createdAt: now, updatedAt: now },
    { _id: 'w2', name: 'Bank', currency: 'USD', initialBalance: 0, order: 1, createdAt: now, updatedAt: now },
  ] as never)
  await db.categories.bulkAdd([
    { _id: 'c1', name: 'Food', type: 'expense', order: 0, createdAt: now, updatedAt: now },
  ] as never)
  await db.transactions.bulkAdd(
    Array.from({ length: 20 }, (_, i) => ({
      _id: `t${i}`,
      walletId: i % 2 ? 'w1' : 'w2',
      categoryId: 'c1',
      transactionType: 'expense',
      amount: 10 + i,
      note: i % 2 ? 'Coffee' : 'Taxi',
      currency: 'USD',
      date: now,
      createdAt: now,
      updatedAt: now,
    })) as never
  )

  listRenders.count = 0
})

describe('TransactionsPage quick filters', () => {
  it('renders the list once per quick filter change, with the filtered rows', async () => {
    const { getByText, getByTestId } = render(<TransactionsPage />)

    await waitFor(() => expect(getByTestId('transaction-count').textContent).toBe('20'))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)) })

    listRenders.count = 0

    await act(async () => {
      fireEvent.click(getByText('filter by Cash'))
      await new Promise(resolve => setTimeout(resolve, 300))
    })

    // The filter change and the query result are two separate commits, but the
    // list only participates in the second: on the first its props are unchanged,
    // so memo skips it rather than re-rendering every row with stale data.
    expect(getByTestId('transaction-count').textContent).toBe('10')
    expect(listRenders.count).toBe(1)

    listRenders.count = 0

    await act(async () => {
      fireEvent.click(getByText('filter by Cash'))
      await new Promise(resolve => setTimeout(resolve, 300))
    })

    expect(getByTestId('transaction-count').textContent).toBe('20')
    expect(listRenders.count).toBe(1)
  })

  it('keeps the real list wrapped in memo', async () => {
    const actual = await vi.importActual<typeof import('./VirtualizedTransactionList')>(
      './VirtualizedTransactionList'
    )
    expect((actual.VirtualizedTransactionList as unknown as { $$typeof: symbol }).$$typeof)
      .toBe(Symbol.for('react.memo'))
  })

  it('reads each table once on mount however many components use it', async () => {
    const calls: Record<string, number> = {}
    const tables = ['wallets', 'categories', 'recurringPayments'] as const
    const restore: (() => void)[] = []

    for (const table of tables) {
      const target = db[table] as unknown as Record<string, (...args: never[]) => unknown>
      const original = target.orderBy.bind(target)
      target.orderBy = (...args: never[]) => {
        calls[table] = (calls[table] ?? 0) + 1
        return original(...args)
      }
      restore.push(() => { target.orderBy = original })
    }

    try {
      const { getByTestId } = render(<TransactionsPage />)
      await waitFor(() => expect(getByTestId('transaction-count').textContent).toBe('20'))
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)) })

      expect(calls.wallets).toBe(1)
      expect(calls.categories).toBe(1)
      // Read with activeOnly on and off, which are two different queries.
      expect(calls.recurringPayments).toBe(2)
    } finally {
      restore.forEach(fn => fn())
    }
  })
})

describe('TransactionsPage search', () => {
  it('narrows the list to what matches and gives it back when closed', async () => {
    const user = userEvent.setup()
    const { getByTestId, getByLabelText, getByPlaceholderText } = render(<TransactionsPage />)

    await waitFor(() => expect(getByTestId('transaction-count').textContent).toBe('20'))

    await user.click(getByLabelText('Search transactions'))
    await user.type(getByPlaceholderText('Search notes or amount'), 'coffee')

    await waitFor(() => expect(getByTestId('transaction-count').textContent).toBe('10'))

    await user.click(getByLabelText('Close search'))

    await waitFor(() => expect(getByTestId('transaction-count').textContent).toBe('20'))
  })

  it('counts what the search left, not what the period holds', async () => {
    const user = userEvent.setup()
    const { getByText, getByLabelText, getByPlaceholderText } = render(<TransactionsPage />)

    await waitFor(() => expect(getByText('20 transactions')).toBeInTheDocument())

    await user.click(getByLabelText('Search transactions'))
    await user.type(getByPlaceholderText('Search notes or amount'), '12')

    await waitFor(() => expect(getByText('1 transaction')).toBeInTheDocument())
  })

  it('widens the period for a search that found nothing here', async () => {
    const user = userEvent.setup()
    const { getByText, getByTestId, getByLabelText, getByPlaceholderText } = render(<TransactionsPage />)

    await waitFor(() => expect(getByTestId('transaction-count').textContent).toBe('20'))

    await user.click(getByLabelText('Search transactions'))
    await user.type(getByPlaceholderText('Search notes or amount'), 'sailboat')

    await waitFor(() => expect(getByTestId('transaction-count').textContent).toBe('0'))

    await user.click(getByText('search the last year'))

    await waitFor(() => expect(getByText('Last 365 days')).toBeInTheDocument())
  })
})
