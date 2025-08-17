import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { apiClient } from '@/lib/api-client'
import { Loader2 } from 'lucide-react'

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
    };
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

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
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
