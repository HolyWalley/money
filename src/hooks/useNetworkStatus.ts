import { useSyncExternalStore } from 'react'
import { getConnectionState, subscribeConnection, type ConnectionState } from '@/lib/network-status'

export function useNetworkStatus(): ConnectionState {
  return useSyncExternalStore(subscribeConnection, getConnectionState, getConnectionState)
}
