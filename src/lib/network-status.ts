export type ConnectionState = 'online' | 'offline' | 'unreachable'

export const UNREACHABLE_FAILURE_THRESHOLD = 2

let consecutiveNetworkFailures = 0
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of [...listeners]) {
    listener()
  }
}

export function getConnectionState(): ConnectionState {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
  if (consecutiveNetworkFailures >= UNREACHABLE_FAILURE_THRESHOLD) return 'unreachable'
  return 'online'
}

export function subscribeConnection(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function reportRequestOutcome(outcome: 'success' | 'network-failure'): void {
  const before = getConnectionState()
  consecutiveNetworkFailures = outcome === 'success' ? 0 : consecutiveNetworkFailures + 1
  if (getConnectionState() !== before) notify()
}

export function resetNetworkStatus(): void {
  consecutiveNetworkFailures = 0
  notify()
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    // Cleared optimistically: navigator says the link is back, so give it a clean
    // slate. Two more failures re-mark it unreachable.
    consecutiveNetworkFailures = 0
    notify()
  })
  window.addEventListener('offline', notify)
}
