import { useState } from 'react'
import { SignInForm } from './SignInForm'
import { SignUpForm } from './SignUpForm'

type AuthMode = 'signin' | 'signup'

export function AuthLayout() {
  const [mode, setMode] = useState<AuthMode>('signin')

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
