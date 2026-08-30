import type { SyncStatus } from '@/lib/sync-status'

export type SyncTone = 'muted' | 'progress' | 'attention' | 'danger'
export type SyncIconName = 'cloud' | 'cloud-upload' | 'cloud-off' | 'cloud-alert' | 'refresh' | 'log-in'

export interface SyncStatusCopy {
  title: string
  detail: string | null
  tone: SyncTone
  icon: SyncIconName
  action: { label: string; kind: 'retry' | 'signin' } | null
  srLabel: string
  showDot: boolean
}

function formatRelative(then: number, now: number): string {
  const elapsed = Math.max(0, now - then)

  if (elapsed < 60_000) return 'just now'
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`
  return `${Math.floor(elapsed / 86_400_000)}d ago`
}

export function describeSyncStatus(status: SyncStatus, now: number = Date.now()): SyncStatusCopy {
  // Changes the outbox refused are unsynced too, so they have to be counted or the
  // copy reads "0 changes waiting to sync". They are NOT durably stored, though, so
  // wherever we would promise the user their data is safe on this device, we must not.
  const n = status.pendingCount + status.unqueuedCount
  const s = n === 1 ? '' : 's'
  const verb = n === 1 ? 'is' : 'are'
  const stranded = status.unqueuedCount > 0
  const atRisk = `This device could not save ${n} change${s}. Keep this tab open until ${n === 1 ? 'it syncs' : 'they sync'}.`

  switch (status.phase) {
    case 'disabled':
      return {
        showDot: false,
        icon: 'cloud',
        tone: 'muted',
        title: '',
        detail: null,
        action: null,
        srLabel: '',
      }
    case 'idle':
      return {
        showDot: false,
        icon: 'cloud',
        tone: 'muted',
        title: 'All changes synced',
        detail: status.lastSyncedAt ? `Last synced ${formatRelative(status.lastSyncedAt, now)}` : null,
        action: null,
        srLabel: 'All changes synced',
      }
    case 'syncing':
      return {
        showDot: true,
        icon: 'refresh',
        tone: 'progress',
        title: 'Syncing…',
        detail: n > 0 ? `Sending ${n} change${s}` : null,
        action: null,
        srLabel: 'Syncing',
      }
    case 'pending':
      return {
        showDot: true,
        icon: 'cloud-upload',
        tone: 'attention',
        title: `${n} change${s} waiting to sync`,
        detail: status.nextRetryAt && status.nextRetryAt > now
          ? `Trying again in ${Math.ceil((status.nextRetryAt - now) / 1000)}s`
          : 'Sending shortly…',
        action: { label: 'Sync now', kind: 'retry' },
        srLabel: `${n} change${s} waiting to sync`,
      }
    case 'offline':
      return n > 0
        ? {
            showDot: true,
            icon: 'cloud-off',
            tone: 'attention',
            title: stranded ? `${n} change${s} not saved yet` : `${n} change${s} saved on this device`,
            detail: stranded ? atRisk : "They'll sync when you're back online.",
            action: null,
            srLabel: `Offline, ${n} change${s} pending`,
          }
        : {
            showDot: true,
            icon: 'cloud-off',
            tone: 'attention',
            title: "You're offline",
            detail: 'Everything here is saved on this device.',
            action: null,
            srLabel: 'Offline',
          }
    case 'error':
      return {
        showDot: true,
        icon: 'cloud-alert',
        tone: 'danger',
        title: "Couldn't sync",
        detail: stranded
          ? atRisk
          : n > 0 ? `${n} change${s} ${verb} safe on this device.` : 'We could not reach the server.',
        action: { label: 'Try again', kind: 'retry' },
        srLabel: 'Sync failed',
      }
    case 'unauthenticated':
      return {
        showDot: true,
        icon: 'log-in',
        tone: 'danger',
        title: 'Signed out — sync paused',
        detail: stranded
          ? atRisk
          : n > 0
            ? `${n} change${s} ${verb} safe on this device. Sign in to send them.`
            : 'Sign in to resume syncing.',
        action: { label: 'Sign in', kind: 'signin' },
        srLabel: 'Signed out, sync paused',
      }
  }
}
