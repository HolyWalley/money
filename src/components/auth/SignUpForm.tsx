import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/contexts/AuthContext'
import { signupSchema, type SignupFormData } from '@/lib/auth-schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Eye, EyeOff, Loader2, Check, X } from 'lucide-react'

interface SignUpFormProps {
  onSignInClick?: () => void
}

export function SignUpForm({ onSignInClick }: SignUpFormProps) {
  const { signup } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isValid },
    reset
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    mode: 'onChange'
  })

  const watchPassword = watch('password', '')

  // Password strength indicators
  const passwordChecks = {
    length: watchPassword.length >= 8,
    lowercase: /[a-z]/.test(watchPassword),
    uppercase: /[A-Z]/.test(watchPassword),
    number: /[0-9]/.test(watchPassword)
  }

  const onSubmit = async (data: SignupFormData) => {
    setIsSubmitting(true)
    setErrorMessage('')

    try {
      const result = await signup(data.username, data.password)
      
      if (!result.success) {
        setErrorMessage(result.error || 'Sign up failed')
      } else {
        reset()
      }
    } catch {
      setErrorMessage('An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const PasswordCheck = ({ passed, text }: { passed: boolean; text: string }) => (
    <div className={`flex items-center space-x-2 text-xs ${passed ? 'text-green-600' : 'text-muted-foreground'}`}>
      {passed ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      <span>{text}</span>
    </div>
  )

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center">Sign Up</CardTitle>
        <CardDescription className="text-center">
          Create your account to get started
        </CardDescription>
      </CardHeader>
      
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              autoComplete="username"
              disabled={isSubmitting}
              {...register('username')}
              className={errors.username ? 'border-red-500' : ''}
            />
            {errors.username && (
              <p className="text-sm text-red-500">{errors.username.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                disabled={isSubmitting}
                {...register('password')}
                className={errors.password ? 'border-red-500 pr-10' : 'pr-10'}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isSubmitting}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                <span className="sr-only">
                  {showPassword ? 'Hide password' : 'Show password'}
                </span>
              </Button>
            </div>
            
            {watchPassword && (
              <div className="space-y-1 p-3 bg-muted rounded-md">
                <p className="text-xs font-medium text-muted-foreground">Password requirements:</p>
                <PasswordCheck passed={passwordChecks.length} text="At least 8 characters" />
                <PasswordCheck passed={passwordChecks.lowercase} text="One lowercase letter" />
                <PasswordCheck passed={passwordChecks.uppercase} text="One uppercase letter" />
                <PasswordCheck passed={passwordChecks.number} text="One number" />
              </div>
            )}
            
            {errors.password && (
              <p className="text-sm text-red-500">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                disabled={isSubmitting}
                {...register('confirmPassword')}
                className={errors.confirmPassword ? 'border-red-500 pr-10' : 'pr-10'}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={isSubmitting}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                <span className="sr-only">
                  {showConfirmPassword ? 'Hide password' : 'Show password'}
                </span>
              </Button>
            </div>
            {errors.confirmPassword && (
              <p className="text-sm text-red-500">{errors.confirmPassword.message}</p>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col space-y-4">
          <Button
            type="submit"
            className="w-full"
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Creating Account...' : 'Sign Up'}
          </Button>

          {onSignInClick && (
            <div className="text-center text-sm">
              <span className="text-muted-foreground">Already have an account?</span>{' '}
              <Button
                type="button"
                variant="link"
                className="p-0 h-auto"
                onClick={onSignInClick}
                disabled={isSubmitting}
              >
                Sign in
              </Button>
            </div>
          )}
        </CardFooter>
      </form>
    </Card>
  )
}