import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/contexts/AuthContext'
import { UserSettingsSchema } from '../../../shared/schemas/user_settings.schema'
import { z } from 'zod'

type SettingsFormData = z.infer<typeof UserSettingsSchema>
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const CURRENCIES = [
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'PLN', label: 'PLN - Polish Zloty' }
] as const

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { user, refreshAuth } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const {
    setValue,
    handleSubmit,
    watch,
    formState: { errors, isDirty },
    reset
  } = useForm<SettingsFormData>({
    resolver: zodResolver(UserSettingsSchema),
    defaultValues: {
      defaultCurrency: 'USD'
    }
  })

  const watchedCurrency = watch('defaultCurrency')

  useEffect(() => {
    if (user?.settings) {
      reset({
        defaultCurrency: (user.settings.defaultCurrency as 'USD' | 'EUR' | 'PLN' | undefined) || 'USD'
      })
    }
  }, [user, reset])

  const onSubmit = async (data: SettingsFormData) => {
    setIsSubmitting(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const response = await fetch('/api/v1/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ settings: data }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update settings')
      }

      setSuccessMessage('Settings updated successfully')
      await refreshAuth()
      
      setTimeout(() => {
        onOpenChange(false)
        setSuccessMessage('')
      }, 1500)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage your account preferences
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 py-4">
            {errorMessage && (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            {successMessage && (
              <Alert>
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-2">
              <Label htmlFor="currency">Default Currency</Label>
              <Select
                value={watchedCurrency}
                onValueChange={(value) => setValue('defaultCurrency', value as 'USD' | 'EUR' | 'PLN', { shouldDirty: true })}
                disabled={isSubmitting}
              >
                <SelectTrigger id="currency">
                  <SelectValue placeholder="Select a currency" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency.value} value={currency.value}>
                      {currency.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.defaultCurrency && (
                <p className="text-sm text-red-500">{errors.defaultCurrency.message}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isDirty || isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
