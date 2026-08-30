import { useNavigate } from 'react-router-dom'
import { useSyncStatus } from '@/hooks/useSyncStatus'
import { requestSyncRetry } from '@/lib/sync-status'
import { SyncStatusDot } from './SyncStatusDot'
import { SyncStatusMenuSection } from './SyncStatusMenuSection'

export function SyncStatusConnector({ variant }: { variant: 'dot' | 'menu' }) {
  const status = useSyncStatus()
  const navigate = useNavigate()

  if (variant === 'dot') return <SyncStatusDot status={status} />

  return (
    <SyncStatusMenuSection
      status={status}
      onRetry={() => { void requestSyncRetry() }}
      onSignIn={() => navigate('/auth')}
    />
  )
}
