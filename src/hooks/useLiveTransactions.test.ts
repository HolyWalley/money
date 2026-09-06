import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { endOfDay, startOfDay } from 'date-fns'
import { db } from '@/lib/db-dexie'
import { resetSharedLiveQueries } from '@/lib/shared-live-query'
import { NONE } from '@/lib/suspense'
import { flushLiveQuery, renderHookSuspended } from '@/test/suspense'
import {
  EMPTY_TRANSACTIONS,
  transactionsKey,
  transactionsStore,
  useLiveTransactions,
  type TransactionFilters,
} from './useLiveTransactions'

vi.mock('@/lib/document-ready', () => ({ documentReady: Promise.resolve() }))

interface RowFields {
  transactionType: 'income' | 'expense' | 'transfer'
  categoryId: string
  walletId: string
  toWalletId?: string
  date: string
}

function row(id: string, fields: RowFields) {
  const date = new Date(`${fields.date}T12:00:00`)
  return {
    _id: id,
    type: 'transaction',
    amount: 10,
    currency: 'EUR',
    ...fields,
    date,
    createdAt: date,
    updatedAt: date,
  }
}

const ids = (transactions: { _id: string }[]) => transactions.map(t => t._id)

async function readTransactions(filters: TransactionFilters | null) {
  const rendered = await renderHookSuspended(
    (props: TransactionFilters | null) => useLiveTransactions(props),
    { initialProps: filters }
  )
  await flushLiveQuery()
  await waitFor(() => expect(rendered.result.current).not.toBeNull())
  return rendered
}

describe('useLiveTransactions', () => {
  beforeEach(async () => {
    resetSharedLiveQueries()
    await db.transactions.clear()
    await db.transactions.bulkAdd([
      row('t1', { transactionType: 'expense', categoryId: 'c-food', walletId: 'w1', date: '2026-09-03' }),
      row('t2', { transactionType: 'income', categoryId: 'c-salary', walletId: 'w2', date: '2026-09-01' }),
      row('t3', { transactionType: 'transfer', categoryId: 'c-misc', walletId: 'w1', toWalletId: 'w2', date: '2026-08-20' }),
      row('t4', { transactionType: 'expense', categoryId: 'c-food', walletId: 'w2', date: '2026-07-15' }),
    ] as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('applies the filters over the shared snapshot', async () => {
    const reads = vi.spyOn(db.transactions, 'orderBy')

    const byWallet = await readTransactions({ walletIds: ['w1'] })
    const bySide = await readTransactions({ walletIds: ['w2'] })
    const byCategoryInPeriod = await readTransactions({
      categoryIds: ['c-food'],
      period: { type: 'custom', customFrom: new Date(2026, 8, 1), customTo: new Date(2026, 8, 30) },
    })
    const byType = await readTransactions({ transactionTypeIds: ['transfer'] })

    expect(ids(byWallet.result.current)).toEqual(['t1', 't3'])
    // A transfer belongs to both of its wallets.
    expect(ids(bySide.result.current)).toEqual(['t2', 't3', 't4'])
    expect(ids(byCategoryInPeriod.result.current)).toEqual(['t1'])
    expect(ids(byType.result.current)).toEqual(['t3'])
    expect(reads).toHaveBeenCalledTimes(1)
  })

  it('treats an empty id list as no filter', async () => {
    const { result } = await readTransactions({ walletIds: [], categoryIds: [] })

    expect(ids(result.current)).toEqual(['t1', 't2', 't3', 't4'])
  })

  it('follows a write', async () => {
    const { result } = await readTransactions({ walletIds: ['w1'] })
    expect(ids(result.current)).toEqual(['t1', 't3'])

    await act(async () => {
      await db.transactions.add(
        row('t5', { transactionType: 'expense', categoryId: 'c-food', walletId: 'w1', date: '2026-09-10' }) as never
      )
    })

    await waitFor(() => expect(ids(result.current)).toEqual(['t5', 't1', 't3']))
  })

  describe('transactionsKey', () => {
    it('ignores the order the ids were ticked in', () => {
      expect(transactionsKey({ walletIds: ['w2', 'w1'], categoryIds: ['b', 'a'], transactionTypeIds: ['income', 'expense'] }))
        .toBe(transactionsKey({ walletIds: ['w1', 'w2'], categoryIds: ['a', 'b'], transactionTypeIds: ['expense', 'income'] }))
    })

    it('tells different ids apart', () => {
      expect(transactionsKey({ walletIds: ['w1'] })).not.toBe(transactionsKey({ walletIds: ['w2'] }))
      expect(transactionsKey({ walletIds: ['w1'] })).not.toBe(transactionsKey({}))
    })

    it('resolves the period to its instants', () => {
      const from = new Date(2026, 8, 1, 15, 30)
      const to = new Date(2026, 8, 30, 9, 0)

      const key = transactionsKey({ period: { type: 'custom', customFrom: from, customTo: to } })

      expect(JSON.parse(key).period).toEqual({
        start: startOfDay(from).getTime(),
        end: endOfDay(to).getTime(),
      })
    })

    it('is the same key for the same month asked twice', () => {
      expect(transactionsKey({ period: { type: 'monthly', monthDay: 1, currentPeriod: -1 } }))
        .toBe(transactionsKey({ period: { type: 'monthly', monthDay: 1, currentPeriod: -1 } }))
    })
  })

  it('hands equal filters the same rows', async () => {
    const { result, rerender } = await readTransactions({ walletIds: ['w1', 'w2'], categoryIds: ['c-food'] })
    const first = result.current
    expect(ids(first)).toEqual(['t1', 't4'])

    // A provider builds a fresh object every render.
    rerender({ categoryIds: ['c-food'], walletIds: ['w2', 'w1'] })
    expect(result.current).toBe(first)

    rerender({ categoryIds: ['c-food'], walletIds: ['w1'] })
    expect(result.current).not.toBe(first)
    expect(ids(result.current)).toEqual(['t1'])
  })

  it('is empty for null without reading', () => {
    const reads = vi.spyOn(db.transactions, 'orderBy')

    // A synchronous render with no boundary: had it suspended, this would throw.
    const { result } = renderHook(() => useLiveTransactions(null))

    expect(result.current).toBe(EMPTY_TRANSACTIONS)
    expect(transactionsStore.peek()).toBe(NONE)
    expect(reads).not.toHaveBeenCalled()
  })

  // The null branch and the store take the same hooks, so a reader whose
  // filters appear and disappear while it is mounted keeps its hook order.
  it('goes from null to filters and back while mounted', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result, rerender } = await renderHookSuspended(
      (props: TransactionFilters | null) => useLiveTransactions(props),
      { initialProps: null as TransactionFilters | null }
    )
    expect(result.current).toBe(EMPTY_TRANSACTIONS)

    await act(async () => {
      rerender({ walletIds: ['w1'] })
    })
    await flushLiveQuery()
    await waitFor(() => expect(ids(result.current)).toEqual(['t1', 't3']))

    await act(async () => {
      rerender(null)
    })

    expect(result.current).toBe(EMPTY_TRANSACTIONS)
    expect(consoleError).not.toHaveBeenCalled()
  })
})
