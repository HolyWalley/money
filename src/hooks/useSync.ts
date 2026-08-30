import { useCallback, useEffect, useRef } from 'react'
import { Sync } from '@/lib/sync'
import { useAuth } from '@/contexts/AuthContext'
import { resetSyncAttempts, resetSyncStatus, setSyncEnabled, type SyncStatus } from '@/lib/sync-status'
import { useSyncStatus } from './useSyncStatus'

export interface UseSyncResult {
  status: SyncStatus
  retry: () => Promise<void>
}

export function useSync(deviceId: string): UseSyncResult {
  const { user, isPremium } = useAuth()
  const activatedAt = user?.premium?.activatedAt
  const syncRef = useRef<Sync | null>(null)
  const activatedAtRef = useRef<string | undefined>(activatedAt)

  useEffect(() => {
    setSyncEnabled(isPremium)
    if (!isPremium) resetSyncStatus()
  }, [isPremium])

  useEffect(() => {
    if (!isPremium) return

    const instance = new Sync(deviceId)
    syncRef.current = instance
    // Pushes as well as pulls: this is what finally flushes a previous session's
    // unsynced updates without waiting for the user to make a local edit.
    void instance.syncNow(activatedAtRef.current)

    return () => {
      instance.destroy()
      syncRef.current = null
    }
  }, [deviceId, isPremium])

  // Kept out of the construction effect on purpose: React runs the cleanup before
  // the effect body, so adding activatedAt to those deps would tear down the Sync
  // instance and its window listeners every time the value changed.
  useEffect(() => {
    activatedAtRef.current = activatedAt
    syncRef.current?.setPremiumActivatedAt(activatedAt)
  }, [activatedAt])

  const retry = useCallback(async () => {
    resetSyncAttempts()
    try {
      await syncRef.current?.syncNow(activatedAtRef.current)
    } catch (error) {
      console.error('Manual sync failed:', error)
    }
  }, [])

  return { status: useSyncStatus(), retry }
}
