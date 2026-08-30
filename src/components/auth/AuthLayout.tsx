import { useState } from 'react'
import { SignInForm } from './SignInForm'
import { SignUpForm } from './SignUpForm'
import { useAuth } from '@/contexts/AuthContext'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { describeAuthConnection } from '@/lib/auth-connection-copy'
import { usePendingUpdateCount } from '@/hooks/useSyncStatus'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { KeyRound, ServerOff, WifiOff } from 'lucide-react'

type AuthMode = 'signin' | 'signup'

function pendingSentence(pending: number): string {
  if (pending <= 0) return ' Nothing you entered was lost.'
  return ` ${pending} change${pending === 1 ? '' : 's'} ${pending === 1 ? 'is' : 'are'} still saved on this device.`
}

export function AuthLayout() {
  const [mode, setMode] = useState<AuthMode>('signin')
  const { sessionExpired } = useAuth()
  const pending = usePendingUpdateCount()
  const connection = useNetworkStatus()
  const connectionNotice = describeAuthConnection(connection)

  return (
    <div className="flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-foreground mb-2">
            Money
          </h1>
          <p className="text-muted-foreground">
            Track your expenses and manage your finances with ease
          </p>
        </div>

        {sessionExpired ? (
          <Alert>
            <KeyRound className="h-4 w-4" />
            <AlertTitle>Your session expired</AlertTitle>
            <AlertDescription>
              Sign in to keep syncing.{pendingSentence(pending)}
            </AlertDescription>
          </Alert>
        ) : connectionNotice ? (
          <Alert variant={connection === 'offline' ? 'destructive' : 'default'}>
            {connection === 'offline'
              ? <WifiOff className="h-4 w-4" />
              : <ServerOff className="h-4 w-4" />}
            <AlertTitle>{connectionNotice.title}</AlertTitle>
            <AlertDescription>{connectionNotice.description}</AlertDescription>
          </Alert>
        ) : null}

        {mode === 'signin' ? (
          <SignInForm onSignUpClick={() => setMode('signup')} />
        ) : (
          <SignUpForm onSignInClick={() => setMode('signin')} />
        )}

        <div className="text-center text-xs text-muted-foreground">
          <p>Secure • Private • Local-first</p>
        </div>
      </div>
    </div>
  )
}
