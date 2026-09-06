import { createElement } from 'react'
import { render, renderHook, act, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '@/lib/db-dexie'
import {
  Boundary,
  Suspended,
  deferred,
  flushLiveQuery,
  mountSuspended,
  renderHookSuspended,
} from '@/test/suspense'
import { NONE } from './suspense'
import {
  createSharedLiveQuery,
  resetSharedLiveQueries,
  FIRST_VALUE_TIMEOUT_MS,
  RETRY_AFTER_ERROR_MS,
  type SharedLiveQuery,
} from './shared-live-query'

const now = new Date()

const wallet = (id: string, order: number) => ({
  _id: id,
  name: id,
  currency: 'USD',
  initialBalance: 0,
  order,
  createdAt: now,
  updatedAt: now,
})

interface Row {
  _id: string
}

const readWallets = (): Promise<Row[]> => db.wallets.orderBy('order').toArray()

function Ids({ store }: { store: SharedLiveQuery<Row[]> }) {
  const rows = store()
  return createElement('div', { 'data-testid': 'rows' }, rows.map((row) => row._id).join(','))
}

describe('createSharedLiveQuery', () => {
  beforeEach(async () => {
    resetSharedLiveQueries()
    await db.wallets.clear()
    await db.wallets.bulkAdd([wallet('w1', 0), wallet('w2', 1)] as never)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('suspends until the first value, then renders it', async () => {
    const answer = deferred<Row[]>()
    const store = createSharedLiveQuery(() => answer.promise)

    await mountSuspended(createElement(Ids, { store }))
    await flushLiveQuery()

    expect(screen.getByTestId('fallback')).toBeInTheDocument()
    expect(screen.queryByTestId('rows')).toBeNull()

    await act(async () => {
      answer.resolve([{ _id: 'a' }, { _id: 'b' }])
    })

    expect(screen.queryByTestId('fallback')).toBeNull()
    expect(screen.getByTestId('rows')).toHaveTextContent('a,b')
  })

  // A suspended component never commits, so nothing has subscribed while the
  // fallback is up; the read itself has to start the query.
  it('starts the query on read, before any subscriber exists', async () => {
    const answer = deferred<Row[]>()
    let runs = 0
    const store = createSharedLiveQuery(() => {
      runs++
      return answer.promise
    })

    await mountSuspended(createElement(Ids, { store }))
    await flushLiveQuery()

    expect(screen.getByTestId('fallback')).toBeInTheDocument()
    expect(runs).toBe(1)
    expect(store.peek()).toBe(NONE)

    await act(async () => {
      answer.resolve([{ _id: 'a' }])
    })

    expect(runs).toBe(1)
    expect(store.peek()).toEqual([{ _id: 'a' }])
    expect(screen.getByTestId('rows')).toHaveTextContent('a')
  })

  it('never suspends a reader once the first value is in', async () => {
    const store = createSharedLiveQuery(readWallets)

    const first = await mountSuspended(createElement(Ids, { store }))
    await flushLiveQuery()
    expect(screen.getByTestId('rows')).toHaveTextContent('w1,w2')
    first.unmount()

    // A synchronous render: had it suspended, the fallback would be all that is
    // on screen.
    render(createElement(Ids, { store }), { wrapper: Suspended })

    expect(screen.queryByTestId('fallback')).toBeNull()
    expect(screen.getByTestId('rows')).toHaveTextContent('w1,w2')
  })

  it('hands every reader the same array identity', async () => {
    const store = createSharedLiveQuery(readWallets)

    const a = await renderHookSuspended(() => store())
    const b = await renderHookSuspended(() => store())
    await waitFor(() => expect(a.result.current).toHaveLength(2))
    await waitFor(() => expect(b.result.current).toHaveLength(2))

    expect(a.result.current).toBe(b.result.current)
    expect(a.result.current).toBe(store.peek())
  })

  it('fans a write out to every reader', async () => {
    const store = createSharedLiveQuery(readWallets)

    const a = await renderHookSuspended(() => store())
    const b = await renderHookSuspended(() => store())
    await waitFor(() => expect(b.result.current).toHaveLength(2))

    await act(async () => {
      await db.wallets.add(wallet('w3', 2) as never)
    })

    await waitFor(() => expect(a.result.current).toHaveLength(3))
    await waitFor(() => expect(b.result.current).toHaveLength(3))
    expect(a.result.current).toBe(b.result.current)
  })

  it('keeps one Dexie subscription for the life of the store', async () => {
    let runs = 0
    const store = createSharedLiveQuery(async () => {
      runs++
      return readWallets()
    })

    const a = await renderHookSuspended(() => store())
    const b = await renderHookSuspended(() => store())
    const c = await renderHookSuspended(() => store())
    await waitFor(() => expect(c.result.current).toHaveLength(2))
    expect(runs).toBe(1)

    a.unmount()
    b.unmount()
    c.unmount()

    // Still subscribed with no reader left: the write is picked up, so the next
    // reader neither waits for it nor re-runs the query.
    await db.wallets.add(wallet('w3', 2) as never)
    await waitFor(() => expect(store.peek()).toHaveLength(3))
    expect(runs).toBe(2)

    const { result } = renderHook(() => store())

    expect(result.current).toHaveLength(3)
    expect(runs).toBe(2)
  })

  it('reports an error before the first value to the boundary and retries after the pause', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    let runs = 0
    const store = createSharedLiveQuery(
      async () => {
        runs++
        if (runs === 1) throw new Error('index missing')
        return readWallets()
      },
      { name: 'wallets' }
    )

    await mountSuspended(createElement(Boundary, null, createElement(Ids, { store })))
    await flushLiveQuery()

    expect(screen.getByTestId('boundary')).toHaveTextContent('index missing')
    expect(consoleError).toHaveBeenCalledWith('The wallets query failed:', expect.any(Error))

    // Inside the pause a retry meets the same rejection instead of a new query.
    await act(async () => {
      fireEvent.click(screen.getByText('Retry'))
    })
    await flushLiveQuery()

    expect(screen.getByTestId('boundary')).toHaveTextContent('index missing')
    expect(runs).toBe(1)

    vi.setSystemTime(Date.now() + RETRY_AFTER_ERROR_MS)

    await act(async () => {
      fireEvent.click(screen.getByText('Retry'))
    })
    await flushLiveQuery()

    expect(screen.queryByTestId('boundary')).toBeNull()
    expect(screen.getByTestId('rows')).toHaveTextContent('w1,w2')
    expect(runs).toBe(2)
  })

  it('keeps the snapshot when a later read fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    let runs = 0
    const store = createSharedLiveQuery(async () => {
      runs++
      if (runs > 1) throw new Error('index gone')
      return readWallets()
    })

    await mountSuspended(createElement(Ids, { store }))
    await flushLiveQuery()
    expect(screen.getByTestId('rows')).toHaveTextContent('w1,w2')

    await act(async () => {
      await db.wallets.add(wallet('w3', 2) as never)
    })
    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith('The shared live query failed:', expect.any(Error))
    )

    expect(screen.getByTestId('rows')).toHaveTextContent('w1,w2')
    expect(store.peek()).toHaveLength(2)
  })

  it('waits for `after` before the first query', async () => {
    const gate = deferred<void>()
    let runs = 0
    const store = createSharedLiveQuery(
      async () => {
        runs++
        return readWallets()
      },
      { after: gate.promise }
    )

    await mountSuspended(createElement(Ids, { store }))
    await flushLiveQuery()

    expect(runs).toBe(0)
    expect(screen.getByTestId('fallback')).toBeInTheDocument()

    await act(async () => {
      gate.resolve()
    })
    await flushLiveQuery()

    expect(runs).toBe(1)
    expect(screen.getByTestId('rows')).toHaveTextContent('w1,w2')
  })

  // During a restore `after` waits for the pull, which can outlast the
  // watchdog; that wait is the spinner's to show, not an error.
  it('does not count the wait for `after` toward the watchdog', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const gate = deferred<void>()
    let runs = 0
    const store = createSharedLiveQuery(
      async () => {
        runs++
        return [{ _id: 'a' }]
      },
      { after: gate.promise, name: 'wallets' }
    )

    const first = store.start()
    vi.advanceTimersByTime(FIRST_VALUE_TIMEOUT_MS)

    expect(first.status).toBe('pending')
    expect(runs).toBe(0)

    gate.resolve()
    await vi.advanceTimersByTimeAsync(1)

    await expect(first).resolves.toEqual([{ _id: 'a' }])
    expect(runs).toBe(1)
    expect(store.peek()).toEqual([{ _id: 'a' }])
  })

  it('fails the read when `after` rejects, without opening the query', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const gate = deferred<void>()
    let runs = 0
    const store = createSharedLiveQuery(
      async () => {
        runs++
        return readWallets()
      },
      { after: gate.promise, name: 'wallets' }
    )

    const first = store.start()
    gate.reject(new Error('doc unreadable'))

    await expect(first).rejects.toThrow('doc unreadable')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(runs).toBe(0)
    expect(store.peek()).toBe(NONE)
    expect(consoleError).toHaveBeenCalledWith('The wallets query failed:', expect.any(Error))
  })

  it('rejects a query that never answers', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = createSharedLiveQuery(() => new Promise<Row[]>(() => {}), { name: 'wallets' })

    const first = store.start()
    expect(store.start()).toBe(first)

    vi.advanceTimersByTime(FIRST_VALUE_TIMEOUT_MS - 1)
    expect(first.status).toBe('pending')

    vi.advanceTimersByTime(1)

    expect(first.status).toBe('rejected')
    await expect(first).rejects.toThrow('The wallets query did not answer')
    expect(consoleError).toHaveBeenCalledWith('The wallets query failed:', expect.any(Error))
  })

  it('useOr returns the fallback and then the value without suspending', async () => {
    const store = createSharedLiveQuery(readWallets)
    const fallback: Row[] = []

    const { result } = renderHook(() => store.useOr(fallback))

    expect(result.current).toBe(fallback)
    await waitFor(() => expect(result.current).toHaveLength(2))
    expect(result.current).toBe(store.peek())
  })

  it('reads again from scratch after a reset', async () => {
    let runs = 0
    const store = createSharedLiveQuery(async () => {
      runs++
      return readWallets()
    })

    await store.start()
    expect(store.peek()).toHaveLength(2)

    resetSharedLiveQueries()

    expect(store.peek()).toBe(NONE)
    await store.start()
    expect(runs).toBe(2)
    expect(store.peek()).toHaveLength(2)
  })
})
