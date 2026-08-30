import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { describeAuthConnection } from '@/lib/auth-connection-copy'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Loader2, ServerOff, WifiOff } from 'lucide-react'

interface ProtectedRouteProps {
  children: ReactNode
}

export const PROTECTED_ROUTE_SLOW_LABEL_MS = 3000

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, refreshAuth } = useAuth()
  const connection = useNetworkStatus()
  const connectionNotice = describeAuthConnection(connection)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (!isLoading) {
      setSlow(false)
      return
    }
    // The request aborts itself at 8s; this only stops the spinner looking frozen.
    const timer = setTimeout(() => setSlow(true), PROTECTED_ROUTE_SLOW_LABEL_MS)
    return () => clearTimeout(timer)
  }, [isLoading])

  // The title comes from the shared helper so this call site cannot drift back into
  // claiming the user is offline when the server is merely unreachable; the description
  // is local because this screen verifies an existing session rather than signing in.
  if (isLoading && connectionNotice) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-4">
        <Alert className="max-w-md">
          {connection === 'offline'
            ? <WifiOff className="h-4 w-4" />
            : <ServerOff className="h-4 w-4" />}
          <AlertTitle>{connectionNotice.title}</AlertTitle>
          <AlertDescription>
            {connection === 'offline'
              ? 'Waiting for a connection to verify your session.'
              : 'Your device is online but the server did not answer.'}
          </AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={() => { void refreshAuth() }}>
          Try again
        </Button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>{slow ? 'Still connecting…' : 'Loading...'}</span>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />
  }

  return <>{children}</>
}
