import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { WalletForm } from './WalletForm'
import { walletService } from '@/services/walletService'
import { useAuth } from '@/contexts/AuthContext'
import type { Wallet, CreateWallet, UpdateWallet } from '../../../shared/schemas/wallet.schema'
import { createWalletSchema, updateWalletSchema } from '../../../shared/schemas/wallet.schema'

interface WalletDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  wallet?: Wallet | null
  onSuccess?: () => void
}

export function WalletDialog({ open, onOpenChange, wallet, onSuccess }: WalletDialogProps) {
  const { user } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditMode = !!wallet

  const form = useForm<CreateWallet | UpdateWallet>({
    resolver: zodResolver(isEditMode ? updateWalletSchema : createWalletSchema),
    defaultValues: {
      name: '',
      currency: 'USD',
      initialBalance: 0,
    },
  })

  useEffect(() => {
    if (wallet) {
      form.reset({
        name: wallet.name,
        currency: wallet.currency,
        initialBalance: wallet.initialBalance,
      })
    } else {
      form.reset({
        name: '',
        currency: 'USD',
        initialBalance: 0,
      })
    }
  }, [wallet, form])

  const onSubmit = async (data: CreateWallet | UpdateWallet) => {
    if (!user) return

    setIsSubmitting(true)
    setError(null)

    try {
      if (isEditMode && wallet) {
        await walletService.updateWallet(wallet._id, data as UpdateWallet)
      } else {
        await walletService.createWallet(data as CreateWallet)
      }
      onOpenChange(false)
      onSuccess?.()
      form.reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Wallet' : 'Create New Wallet'}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Update your wallet details below.'
              : 'Add a new wallet to track your finances.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <WalletForm form={form} isSubmitting={isSubmitting} />

          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
