import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { authState, syncInstances, SyncDouble } = vi.hoisted(() => {
  const instances: Array<{
    deviceId: string
    flush: ReturnType<typeof vi.fn>
    pull: ReturnType<typeof vi.fn>
    syncNow: ReturnType<typeof vi.fn>
    setPremiumActivatedAt: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>
  }> = []

  class Double {
    deviceId: string
    flush = vi.fn(async () => {})
    pull = vi.fn(async () => {})
    syncNow = vi.fn(async () => {})
    setPremiumActivatedAt = vi.fn()
    destroy = vi.fn()

    constructor(deviceId: string) {
      this.deviceId = deviceId
      instances.push(this)
    }
  }

  // A single shared object: a fresh identity on every render restarts the effects
  // in a loop.
  return {
    authState: { user: null as { premium?: { activatedAt?: string } } | null, isPremium: false },
    syncInstances: instances,
    SyncDouble: Double,
  }
})

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('@/lib/sync', () => ({ Sync: SyncDouble }))

import { useSync } from './useSync'
import { getSyncStatusSnapshot, resetSyncStatus } from '@/lib/sync-status'
import { resetNetworkStatus } from '@/lib/network-status'
import { updatesDb } from '@/lib/updates-db'

describe('useSync', () => {
  beforeEach(async () => {
    await updatesDb.open()
    await updatesDb.updates.clear()
    syncInstances.length = 0
    authState.user = { premium: { activatedAt: '2024-01-01T00:00:00.000Z' } }
    authState.isPremium = true
    resetSyncStatus()
    resetNetworkStatus()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  })

  afterEach(() => {
    resetSyncStatus()
  })

  it('never constructs Sync for a non-premium user and reports phase disabled', async () => {
    authState.isPremium = false
    authState.user = null

    const { result } = renderHook(() => useSync('device-1'))

    await waitFor(() => expect(result.current.status.phase).toBe('disabled'))
    expect(syncInstances).toHaveLength(0)
  })

  it('constructs exactly one Sync for a premium user', async () => {
    const { rerender } = renderHook(() => useSync('device-1'))

    await waitFor(() => expect(syncInstances).toHaveLength(1))
    rerender()
    rerender()

    expect(syncInstances).toHaveLength(1)
    expect(syncInstances[0].deviceId).toBe('device-1')
  })

  it('calls syncNow once on mount', async () => {
    renderHook(() => useSync('device-1'))

    await waitFor(() => expect(syncInstances).toHaveLength(1))
    expect(syncInstances[0].syncNow).toHaveBeenCalledTimes(1)
    expect(syncInstances[0].syncNow).toHaveBeenCalledWith('2024-01-01T00:00:00.000Z')
  })

  it('retry calls syncNow, not pull', async () => {
    const { result } = renderHook(() => useSync('device-1'))
    await waitFor(() => expect(syncInstances).toHaveLength(1))
    syncInstances[0].syncNow.mockClear()

    await act(async () => { await result.current.retry() })

    expect(syncInstances[0].syncNow).toHaveBeenCalledTimes(1)
    expect(syncInstances[0].pull).not.toHaveBeenCalled()
  })

  it('retry never rejects even when the instance rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useSync('device-1'))
    await waitFor(() => expect(syncInstances).toHaveLength(1))
    syncInstances[0].syncNow.mockRejectedValueOnce(new Error('offline'))

    await expect(result.current.retry()).resolves.toBeUndefined()
  })

  it('retry keeps a stable identity across re-renders', async () => {
    const { result, rerender } = renderHook(() => useSync('device-1'))
    await waitFor(() => expect(syncInstances).toHaveLength(1))

    const first = result.current.retry
    rerender()

    expect(result.current.retry).toBe(first)
  })

  it('changing only premium.activatedAt calls setPremiumActivatedAt and does NOT construct a second instance', async () => {
    const { rerender } = renderHook(() => useSync('device-1'))
    await waitFor(() => expect(syncInstances).toHaveLength(1))

    authState.user = { premium: { activatedAt: '2025-06-01T00:00:00.000Z' } }
    rerender()

    await waitFor(() =>
      expect(syncInstances[0].setPremiumActivatedAt).toHaveBeenCalledWith('2025-06-01T00:00:00.000Z'))
    expect(syncInstances).toHaveLength(1)
  })

  it('destroys the instance on unmount', async () => {
    const { unmount } = renderHook(() => useSync('device-1'))
    await waitFor(() => expect(syncInstances).toHaveLength(1))

    unmount()

    expect(syncInstances[0].destroy).toHaveBeenCalledTimes(1)
  })

  it('destroys the instance and resets the store when premium flips false', async () => {
    const { result, rerender } = renderHook(() => useSync('device-1'))
    await waitFor(() => expect(syncInstances).toHaveLength(1))
    expect(getSyncStatusSnapshot().enabled).toBe(true)

    authState.isPremium = false
    rerender()

    expect(syncInstances[0].destroy).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current.status.phase).toBe('disabled'))
    expect(getSyncStatusSnapshot().enabled).toBe(false)
  })
})
