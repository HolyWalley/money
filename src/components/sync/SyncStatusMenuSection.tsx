import { Cloud, CloudAlert, CloudOff, CloudUpload, LogIn, RefreshCw, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SyncStatus } from '@/lib/sync-status'
import { describeSyncStatus, type SyncIconName } from './sync-status-copy'

const icons: Record<SyncIconName, LucideIcon> = {
  cloud: Cloud,
  'cloud-upload': CloudUpload,
  'cloud-off': CloudOff,
  'cloud-alert': CloudAlert,
  refresh: RefreshCw,
  'log-in': LogIn,
}

export function SyncStatusMenuSection({
  status,
  onRetry,
  onSignIn,
}: {
  status: SyncStatus
  onRetry: () => void
  onSignIn: () => void
}) {
  if (status.phase === 'disabled') return null

  const copy = describeSyncStatus(status)
  const Icon = icons[copy.icon]

  return (
    <div className="px-2 py-1.5">
      <div className="flex items-start gap-2">
        <Icon className={cn('h-4 w-4 shrink-0 text-muted-foreground', copy.icon === 'refresh' && 'animate-spin')} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{copy.title}</p>
          {copy.detail && <p className="text-xs text-muted-foreground">{copy.detail}</p>}
          {copy.action && (
            <Button
              variant="ghost"
              size="xs"
              className="mt-1 -ml-1"
              disabled={status.phase === 'syncing'}
              onClick={copy.action.kind === 'retry' ? onRetry : onSignIn}
            >
              {copy.action.label}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
