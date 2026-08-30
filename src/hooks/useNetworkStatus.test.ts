import { describe, it, expect, afterEach } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useNetworkStatus } from './useNetworkStatus'
import { resetNetworkStatus } from '@/lib/network-status'

function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value })
}

afterEach(() => {
  cleanup()
  setOnLine(true)
  resetNetworkStatus()
})

describe('useNetworkStatus', () => {
  it('returns online initially', () => {
    const { result } = renderHook(() => useNetworkStatus())

    expect(result.current).toBe('online')
  })

  it('re-renders as offline when the offline event fires', () => {
    const { result } = renderHook(() => useNetworkStatus())

    act(() => {
      setOnLine(false)
      window.dispatchEvent(new Event('offline'))
    })

    expect(result.current).toBe('offline')
  })

  it('re-renders as online again on the online event', () => {
    const { result } = renderHook(() => useNetworkStatus())

    act(() => {
      setOnLine(false)
      window.dispatchEvent(new Event('offline'))
    })
    act(() => {
      setOnLine(true)
      window.dispatchEvent(new Event('online'))
    })

    expect(result.current).toBe('online')
  })

  it('stops listening after unmount', () => {
    let renders = 0
    const { unmount } = renderHook(() => {
      renders += 1
      return useNetworkStatus()
    })
    const rendersBeforeUnmount = renders

    unmount()
    act(() => {
      setOnLine(false)
      window.dispatchEvent(new Event('offline'))
    })

    expect(renders).toBe(rendersBeforeUnmount)
  })
})
