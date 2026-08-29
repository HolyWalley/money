import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db-dexie'
import { createSharedLiveQuery, createKeyedSharedLiveQuery } from './shared-live-query'

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

describe('createSharedLiveQuery', () => {
  beforeEach(async () => {
    await db.wallets.clear()
    await db.wallets.bulkAdd([wallet('w1', 0), wallet('w2', 1)] as never)
  })

  it('runs the query once for many subscribers', async () => {
    let runs = 0
    const useShared = createSharedLiveQuery(async () => {
      runs++
      return db.wallets.orderBy('order').toArray()
    })

    const a = renderHook(() => useShared())
    const b = renderHook(() => useShared())
    const c = renderHook(() => useShared())

    await waitFor(() => expect(a.result.current).toHaveLength(2))
    await waitFor(() => expect(c.result.current).toHaveLength(2))

    expect(runs).toBe(1)

    a.unmount()
    b.unmount()
    c.unmount()
  })

  it('hands every subscriber the same array identity', async () => {
    const useShared = createSharedLiveQuery(() => db.wallets.orderBy('order').toArray())

    const a = renderHook(() => useShared())
    const b = renderHook(() => useShared())

    await waitFor(() => expect(a.result.current).toHaveLength(2))
    await waitFor(() => expect(b.result.current).toHaveLength(2))

    expect(a.result.current).toBe(b.result.current)

    a.unmount()
    b.unmount()
  })

  it('pushes writes to every subscriber', async () => {
    const useShared = createSharedLiveQuery(() => db.wallets.orderBy('order').toArray())

    const a = renderHook(() => useShared())
    const b = renderHook(() => useShared())

    await waitFor(() => expect(a.result.current).toHaveLength(2))

    await act(async () => {
      await db.wallets.add(wallet('w3', 2) as never)
    })

    await waitFor(() => expect(a.result.current).toHaveLength(3))
    await waitFor(() => expect(b.result.current).toHaveLength(3))

    a.unmount()
    b.unmount()
  })

  it('re-subscribes after the last subscriber unmounts', async () => {
    let runs = 0
    const useShared = createSharedLiveQuery(async () => {
      runs++
      return db.wallets.orderBy('order').toArray()
    })

    const first = renderHook(() => useShared())
    await waitFor(() => expect(first.result.current).toHaveLength(2))
    first.unmount()

    await act(async () => {
      await db.wallets.add(wallet('w3', 2) as never)
    })

    const second = renderHook(() => useShared())
    await waitFor(() => expect(second.result.current).toHaveLength(3))
    expect(runs).toBe(2)

    second.unmount()
  })
})

describe('createKeyedSharedLiveQuery', () => {
  beforeEach(async () => {
    await db.wallets.clear()
    await db.wallets.bulkAdd([wallet('w1', 0), wallet('w2', 1)] as never)
  })

  it('shares one subscription per key', async () => {
    const runsByKey: Record<string, number> = {}
    const useShared = createKeyedSharedLiveQuery(async (key: string) => {
      runsByKey[key] = (runsByKey[key] ?? 0) + 1
      const all = await db.wallets.orderBy('order').toArray()
      return key === 'first' ? all.slice(0, 1) : all
    })

    const a = renderHook(() => useShared('first'))
    const b = renderHook(() => useShared('first'))
    const c = renderHook(() => useShared('all'))

    await waitFor(() => expect(a.result.current).toHaveLength(1))
    await waitFor(() => expect(c.result.current).toHaveLength(2))

    expect(runsByKey).toEqual({ first: 1, all: 1 })
    expect(a.result.current).toBe(b.result.current)

    a.unmount()
    b.unmount()
    c.unmount()
  })
})
