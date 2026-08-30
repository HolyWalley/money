import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  getConnectionState,
  reportRequestOutcome,
  resetNetworkStatus,
  subscribeConnection,
} from './network-status'

function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value })
}

afterEach(() => {
  setOnLine(true)
  resetNetworkStatus()
})

describe('network-status', () => {
  it('starts online', () => {
    expect(getConnectionState()).toBe('online')
  })

  it('reports offline when navigator.onLine is false, even after successes', () => {
    setOnLine(false)
    reportRequestOutcome('success')

    expect(getConnectionState()).toBe('offline')
  })

  it('stays online after a single network failure', () => {
    reportRequestOutcome('network-failure')

    expect(getConnectionState()).toBe('online')
  })

  it('becomes unreachable after two consecutive network failures', () => {
    reportRequestOutcome('network-failure')
    reportRequestOutcome('network-failure')

    expect(getConnectionState()).toBe('unreachable')
  })

  it('a success between two failures resets the counter and keeps it online', () => {
    reportRequestOutcome('network-failure')
    reportRequestOutcome('success')
    reportRequestOutcome('network-failure')

    expect(getConnectionState()).toBe('online')
  })

  it('offline wins over unreachable', () => {
    reportRequestOutcome('network-failure')
    reportRequestOutcome('network-failure')
    setOnLine(false)

    expect(getConnectionState()).toBe('offline')
  })

  it('notifies subscribers once per state change, not once per report', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeConnection(listener)

    reportRequestOutcome('network-failure')
    reportRequestOutcome('network-failure')
    reportRequestOutcome('network-failure')

    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('dispatching the online event clears the counter and notifies', () => {
    reportRequestOutcome('network-failure')
    reportRequestOutcome('network-failure')
    const listener = vi.fn()
    const unsubscribe = subscribeConnection(listener)

    window.dispatchEvent(new Event('online'))

    expect(listener).toHaveBeenCalledTimes(1)
    expect(getConnectionState()).toBe('online')
    unsubscribe()
  })

  it('dispatching the offline event flips the state', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeConnection(listener)

    setOnLine(false)
    window.dispatchEvent(new Event('offline'))

    expect(listener).toHaveBeenCalledTimes(1)
    expect(getConnectionState()).toBe('offline')
    unsubscribe()
  })

  it('the unsubscribe function stops further notifications', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeConnection(listener)

    unsubscribe()
    reportRequestOutcome('network-failure')
    reportRequestOutcome('network-failure')

    expect(listener).not.toHaveBeenCalled()
  })
})
