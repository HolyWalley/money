import { useState } from 'react'
import { SignInForm } from './SignInForm'
import { SignUpForm } from './SignUpForm'

type AuthMode = 'signin' | 'signup'

export function AuthLayout() {
  const [mode, setMode] = useState<AuthMode>('signin')

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Personal Finance Tracker
          </h1>
          <p className="text-gray-600">
            Track your expenses and manage your finances with ease
          </p>
        </div>

        {mode === 'signin' ? (
          <SignInForm onSignUpClick={() => setMode('signup')} />
        ) : (
          <SignUpForm onSignInClick={() => setMode('signin')} />
        )}

        <div className="text-center text-xs text-gray-500">
          <p>Secure • Private • Local-first</p>
        </div>
      </div>
    </div>
  )
}