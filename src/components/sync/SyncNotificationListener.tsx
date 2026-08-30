import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { SyncPhase, SyncStatus } from '@/lib/sync-status'
import { requestSyncRetry } from '@/lib/sync-status'

// Only a state the user was warned about earns a confirmation when it clears.
// 'pending' is not one: every ordinary edit sits there for the push debounce, so
// confirming it would put a toast on screen after every single transaction.
const RESOLVED_FROM: SyncPhase[] = ['offline', 'error']

export function SyncNotificationListener({ status }: { status: SyncStatus }) {
  const previousPhase = useRef<SyncPhase | null>(null)
  const previousPending = useRef(0)
  // A flush raises activeOperations before it marks the outbox rows synced, so the
  // render where pendingCount reaches 0 is 'syncing', never the phase that earned the
  // confirmation. Remembering the unresolved warning instead of reading the previous
  // phase is what makes this toast reachable at all.
  const unresolved = useRef<SyncPhase | null>(null)
  // The count at the drop is only the last batch; a backlog drains in several.
  const pendingPeak = useRef(0)

  useEffect(() => {
    const previous = previousPhase.current
    const pendingBefore = previousPending.current
    const n = status.pendingCount
    const s = n === 1 ? '' : 's'
    const verb = n === 1 ? 'is' : 'are'

    const resolvedCount =
      n === 0 && pendingBefore > 0 && unresolved.current !== null ? pendingPeak.current : 0

    previousPhase.current = status.phase
    previousPending.current = n
    pendingPeak.current = n === 0 ? 0 : Math.max(pendingPeak.current, n)
    if (n === 0) unresolved.current = null
    else if (RESOLVED_FROM.includes(status.phase)) unresolved.current = status.phase

    // Mount is not a transition; sync churns on every Yjs update and a toast
    // per state would be unusable on the connection this exists for.
    if (previous === null) return

    if (status.phase === 'offline' && previous !== 'offline' && n > 0) {
      toast("You're offline", {
        description: `${n} change${s} ${verb} saved on this device.`,
        duration: 4000,
        id: 'sync-offline',
      })
    }

    if (previous === 'offline' && status.phase !== 'offline' && n > 0) {
      toast('Back online', {
        description: `Syncing ${n} change${s}…`,
        duration: 3000,
        id: 'sync-online',
      })
    }

    if (resolvedCount > 0) {
      toast(`Synced ${resolvedCount} change${resolvedCount === 1 ? '' : 's'}`, { duration: 3000 })
    }

    if (status.phase === 'error' && previous !== 'error') {
      toast("Couldn't sync", {
        description: `${n} change${s} ${verb} safe on this device.`,
        duration: 10000,
        action: {
          label: 'Try again',
          onClick: () => { void requestSyncRetry() },
        },
      })
    }

    if (status.phase === 'unauthenticated' && previous !== 'unauthenticated') {
      toast('Signed out — sync paused', {
        description: 'Sign in to send your pending changes.',
        duration: Infinity,
        id: 'sync-auth',
      })
    }
  }, [status])

  return null
}
