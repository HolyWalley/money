import { cn } from '@/lib/utils'
import type { SyncStatus } from '@/lib/sync-status'
import { describeSyncStatus, type SyncTone } from './sync-status-copy'

const toneClasses: Record<SyncTone, string> = {
  muted: 'bg-muted-foreground',
  progress: 'bg-sky-500 animate-pulse',
  attention: 'bg-amber-500',
  danger: 'bg-destructive',
}

export function SyncStatusDot({ status }: { status: SyncStatus }) {
  const copy = describeSyncStatus(status)

  if (!copy.showDot) return null

  return (
    <span
      className={cn(
        'absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background',
        toneClasses[copy.tone]
      )}
    >
      <span className="sr-only">{copy.srLabel}</span>
    </span>
  )
}
