import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { usePendingUpdateCount, useSyncStatus } from './useSyncStatus'
import { updatesDb } from '@/lib/updates-db'
import { resetSharedLiveQueries } from '@/lib/shared-live-query'
import { resetSyncStatus, setSyncEnabled } from '@/lib/sync-status'
import { resetNetworkStatus } from '@/lib/network-status'

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })
}

async function seed(count: number): Promise<void> {
  await updatesDb.updates.bulkAdd(Array.from({ length: count }, (_, i) => ({
    update: new Uint8Array([i]),
    timestamp: 1_000 + i,
    synced: 0 as const,
    deviceId: 'dev-1',
  })))
}

describe('useSyncStatus', () => {
  beforeEach(async () => {
    resetSharedLiveQueries()
    await updatesDb.open()
    await updatesDb.updates.clear()
    resetSyncStatus()
    resetNetworkStatus()
    setOnline(true)
  })

  afterEach(async () => {
    resetSyncStatus()
    setOnline(true)
    await updatesDb.updates.clear()
  })

  // Read above every Suspense boundary, so it must answer on the first render.
  it('usePendingUpdateCount is 0 at once, without suspending', async () => {
    const { result } = renderHook(() => usePendingUpdateCount())

    expect(result.current).toBe(0)
  })

  it('usePendingUpdateCount answers rows that were there before the first read', async () => {
    await seed(2)
    const { result } = renderHook(() => usePendingUpdateCount())

    expect(result.current).toBe(0)
    await waitFor(() => expect(result.current).toBe(2))
  })

  it('usePendingUpdateCount reflects a bulkAdd', async () => {
    const { result } = renderHook(() => usePendingUpdateCount())
    await waitFor(() => expect(result.current).toBe(0))

    await act(async () => { await seed(3) })

    await waitFor(() => expect(result.current).toBe(3))
  })

  it('usePendingUpdateCount drops after rows are marked synced', async () => {
    await seed(2)
    const { result } = renderHook(() => usePendingUpdateCount())
    await waitFor(() => expect(result.current).toBe(2))

    await act(async () => { await updatesDb.updates.toCollection().modify({ synced: 1 }) })

    await waitFor(() => expect(result.current).toBe(0))
  })

  it('useSyncStatus reports disabled before setSyncEnabled(true)', async () => {
    const { result } = renderHook(() => useSyncStatus())

    await waitFor(() => expect(result.current.phase).toBe('disabled'))
    expect(result.current.maxAttempts).toBe(5)
  })

  it('useSyncStatus reports pending with unsynced rows while online', async () => {
    await seed(2)
    const { result } = renderHook(() => useSyncStatus())

    act(() => { setSyncEnabled(true) })

    await waitFor(() => expect(result.current.phase).toBe('pending'))
    expect(result.current.pendingCount).toBe(2)
  })

  it('useSyncStatus reports offline after the offline event', async () => {
    const { result } = renderHook(() => useSyncStatus())
    act(() => { setSyncEnabled(true) })
    await waitFor(() => expect(result.current.phase).toBe('idle'))

    act(() => {
      setOnline(false)
      window.dispatchEvent(new Event('offline'))
    })

    await waitFor(() => expect(result.current.phase).toBe('offline'))
  })
})
