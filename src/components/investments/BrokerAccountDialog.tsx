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
import { BrokerAccountForm, brokerAccountFormSchema } from './BrokerAccountForm'
import type { BrokerAccountFormValues } from './BrokerAccountForm'
import { investmentService } from '@/services/investmentService'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import type { BrokerAccount } from '../../../shared/schemas/broker-account.schema'

interface BrokerAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account?: BrokerAccount | null
  onSuccess?: () => void
}

const EMPTY_VALUES: BrokerAccountFormValues = {
  name: '',
  broker: 'degiro',
  cashWalletId: undefined,
}

export function BrokerAccountDialog({ open, onOpenChange, account, onSuccess }: BrokerAccountDialogProps) {
  const { wallets } = useLiveWallets()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditMode = !!account

  const form = useForm<BrokerAccountFormValues>({
    resolver: zodResolver(brokerAccountFormSchema),
    defaultValues: EMPTY_VALUES,
  })

  // Keyed on `open` as well: reopening "Add account" leaves the same null
  // account behind, so without it an abandoned draft and its error survive
  // into the next attempt.
  useEffect(() => {
    if (!open) return

    if (account) {
      form.reset({
        name: account.name,
        broker: account.broker,
        cashWalletId: account.cashWalletId,
      })
    } else {
      form.reset(EMPTY_VALUES)
    }
    setError(null)
  }, [account, form, open])

  const onSubmit = async (data: BrokerAccountFormValues) => {
    setIsSubmitting(true)
    setError(null)

    try {
      // cashWalletId is spelled out rather than spread, because a missing key
      // means "leave the link alone" while a present undefined one clears it.
      const payload = {
        name: data.name,
        broker: data.broker,
        cashWalletId: data.cashWalletId || undefined,
      }

      if (isEditMode && account) {
        await investmentService.updateBrokerAccount(account._id, payload)
      } else {
        await investmentService.createBrokerAccount(payload)
      }

      onOpenChange(false)
      onSuccess?.()
      form.reset(EMPTY_VALUES)
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
          <DialogTitle>{isEditMode ? 'Edit Broker Account' : 'Add Broker Account'}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Update this broker account and the wallet its cash sits in.'
              : 'Track the positions held at one broker, and where its cash sits.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <BrokerAccountForm form={form} wallets={wallets} isSubmitting={isSubmitting} />

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
