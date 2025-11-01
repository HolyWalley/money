import { useEffect, useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { apiClient } from '@/lib/api-client'
import { Loader2, Download, Upload } from 'lucide-react'
import Dexie from 'dexie'
import { db as moneyDb } from '@/lib/db-dexie'

interface DebugModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DebugModal({ open, onOpenChange }: DebugModalProps) {
  const [loading, setLoading] = useState(false)
  const [debugInfo, setDebugInfo] = useState<{
    durableObject: {
      userId: string;
      storageSizes: {
        updatesTableBytes: number;
        compiledStateBytes: number;
        totalBytes: number;
      };
      updateStatistics: {
        count: number;
        totalBytes: number;
        minSize: number;
        maxSize: number;
        avgSize: number;
        medianSize: number;
        distribution: { range: string; count: number }[];
      };
    };
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploadResult, setUploadResult] = useState<string | null>(null)
  const [debugMessage, setDebugMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setLoading(true)
      setError(null)
      
      apiClient.getDebugInfo()
        .then(response => {
          if (response.ok && response.data) {
            setDebugInfo(response.data)
          } else {
            setError(response.error || 'Failed to fetch debug information')
          }
        })
        .catch(err => {
          console.error('Failed to fetch debug info:', err)
          setError('Failed to fetch debug information')
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }, [open])

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  const handleDumpDatabase = async () => {
    try {
      // Create a download link with authentication cookies
      const link = document.createElement('a')
      link.href = apiClient.getDatabaseDumpUrl()
      link.download = `money-db-dump-${Date.now()}.ndjson`
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('Failed to download database dump:', err)
      setError('Failed to download database dump')
    }
  }

  const handleDeletePremiumSyncTimestamp = async () => {
    try {
      setDebugMessage(null)
      setError(null)

      const syncDb = new Dexie('UpdatesDB')
      syncDb.version(1).stores({
        updates: '++id, timestamp, synced, deviceId',
        syncMetadata: 'key'
      })

      await syncDb.open()
      const deleted = await syncDb.table('syncMetadata').where('key').equals('lastPremiumSyncTimestamp').delete()
      syncDb.close()

      if (deleted > 0) {
        setDebugMessage('✓ Deleted lastPremiumSyncTimestamp. Next sync will trigger initial sync (100KB upload). Make any change to trigger sync.')
      } else {
        setDebugMessage('No lastPremiumSyncTimestamp found (already deleted or never set)')
      }
    } catch (err) {
      console.error('Failed to delete premium sync timestamp:', err)
      setError('Failed to delete premium sync timestamp')
    }
  }

  const handleCleanupOldUpdates = async () => {
    if (!confirm('This will delete all old updates from the server and keep only the compiled state. This action cannot be undone. Continue?')) {
      return
    }

    setLoading(true)
    setDebugMessage(null)
    setError(null)

    try {
      const response = await apiClient.cleanupOldUpdates()

      if (response.ok && response.data) {
        setDebugMessage(
          `✓ Cleanup completed!\n` +
          `Deleted: ${response.data.deletedCount} updates\n` +
          `Remaining: ${response.data.remainingKB} KB (${response.data.remainingMB} MB)\n\n` +
          `Refreshing debug info...`
        )

        // Refresh debug info
        const debugResponse = await apiClient.getDebugInfo()
        if (debugResponse.ok && debugResponse.data) {
          setDebugInfo(debugResponse.data)
        }
      } else {
        setError(response.error || 'Failed to cleanup old updates')
      }
    } catch (err) {
      console.error('Failed to cleanup old updates:', err)
      setError('Failed to cleanup old updates')
    } finally {
      setLoading(false)
    }
  }

  const handleImportDatabase = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError(null)
    setUploadResult(null)
    setDebugMessage(null)

    try {
      const response = await apiClient.importDatabaseDump(file)
      if (response.ok && response.data) {
        setUploadResult(
          `Successfully imported ${response.data.updatesImported} updates` +
          (response.data.hasCompiledState ? ' and compiled state' : '')
        )
        
        // Clear local sync metadata to force a fresh pull
        const syncDb = new Dexie('UpdatesDB')
        syncDb.version(1).stores({
          updates: '++id, timestamp, synced, deviceId',
          syncMetadata: 'key'
        })
        
        try {
          // Clear all local updates and metadata
          await syncDb.table('updates').clear()
          await syncDb.table('syncMetadata').clear()
          
          // Clear all MoneyDB tables
          await moneyDb.categories.clear()
          await moneyDb.wallets.clear()
          await moneyDb.transactions.clear()
          
          // Force a page reload to trigger fresh sync
          setUploadResult(prev => prev + '\nCleared local data. Reloading page to sync imported data...')
          setTimeout(() => {
            window.location.reload()
          }, 2000)
        } catch (err) {
          console.error('Failed to clear local data:', err)
        } finally {
          syncDb.close()
        }
        
        // Refresh debug info
        const debugResponse = await apiClient.getDebugInfo()
        if (debugResponse.ok && debugResponse.data) {
          setDebugInfo(debugResponse.data)
        }
      } else {
        setError(response.error || 'Failed to import database')
      }
    } catch (err) {
      console.error('Failed to import database:', err)
      setError('Failed to import database')
    } finally {
      setLoading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Debug Information</DialogTitle>
          <DialogDescription>
            Useful information for debugging and development
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          
          {error && (
            <div className="text-sm text-destructive">
              Error: {error}
            </div>
          )}
          
          {uploadResult && (
            <div className="text-sm text-green-600 whitespace-pre-line">
              {uploadResult}
            </div>
          )}

          {debugMessage && (
            <div className="text-sm text-blue-600 whitespace-pre-line">
              {debugMessage}
            </div>
          )}

          {debugInfo && !loading && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2">Durable Object Storage</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center py-1">
                    <span className="text-muted-foreground">User ID:</span>
                    <span className="font-mono">{debugInfo.durableObject.userId}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-muted-foreground">Updates Table:</span>
                    <span className="font-mono">{formatBytes(debugInfo.durableObject.storageSizes.updatesTableBytes)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-muted-foreground">Compiled State:</span>
                    <span className="font-mono">{formatBytes(debugInfo.durableObject.storageSizes.compiledStateBytes)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 pt-2 border-t">
                    <span className="text-muted-foreground font-medium">Total:</span>
                    <span className="font-mono font-medium">{formatBytes(debugInfo.durableObject.storageSizes.totalBytes)}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2">Update Statistics</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center py-1">
                    <span className="text-muted-foreground">Total Updates:</span>
                    <span className="font-mono">{debugInfo.durableObject.updateStatistics.count}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-muted-foreground">Min Size:</span>
                    <span className="font-mono">{formatBytes(debugInfo.durableObject.updateStatistics.minSize)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-muted-foreground">Max Size:</span>
                    <span className="font-mono">{formatBytes(debugInfo.durableObject.updateStatistics.maxSize)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-muted-foreground">Average Size:</span>
                    <span className="font-mono">{formatBytes(debugInfo.durableObject.updateStatistics.avgSize)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-muted-foreground">Median Size:</span>
                    <span className="font-mono">{formatBytes(debugInfo.durableObject.updateStatistics.medianSize)}</span>
                  </div>
                  {debugInfo.durableObject.updateStatistics.distribution.length > 0 && (
                    <div className="pt-2 border-t">
                      <span className="text-muted-foreground font-medium">Distribution:</span>
                      <div className="mt-1 space-y-1 pl-2">
                        {debugInfo.durableObject.updateStatistics.distribution.map(bucket => (
                          <div key={bucket.range} className="flex justify-between items-center py-0.5">
                            <span className="text-muted-foreground text-xs">{bucket.range}:</span>
                            <span className="font-mono text-xs">{bucket.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <h3 className="text-sm font-medium mb-2">Database Operations</h3>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDumpDatabase}
                    disabled={loading}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Dump Database
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Import Database
                  </Button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".ndjson,.json"
                    onChange={handleImportDatabase}
                    className="hidden"
                  />
                </div>
              </div>

              <div className="mt-4">
                <h3 className="text-sm font-medium mb-2">Debug Tools</h3>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeletePremiumSyncTimestamp}
                    disabled={loading}
                  >
                    Delete Premium Sync Timestamp
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleCleanupOldUpdates}
                    disabled={loading}
                  >
                    Cleanup Old Updates
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Delete Premium Sync Timestamp: Triggers full state sync on next change (testing only)
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Cleanup Old Updates: Deletes all historical updates from server, keeps only compiled state (saves storage)
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
