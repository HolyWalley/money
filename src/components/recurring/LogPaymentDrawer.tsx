import { useState, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { Form } from '@/components/ui/form'
import { TransactionForm } from '@/components/transactions/TransactionForm'
import { useTransactionForm } from '@/hooks/useTransactionForm'
import { recurringPaymentService } from '@/services/recurringPaymentService'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { detectTemplateChanges, type TemplateChange } from '@/lib/recurring-utils'
import type { UpcomingPayment } from '@/hooks/useUpcomingPayments'
import type { CreateTransaction } from '../../../shared/schemas/transaction.schema'
import { format } from 'date-fns'

interface LogPaymentDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  payment: UpcomingPayment | null
  onSuccess?: () => void
}

function ChangeLabel({ change, categories, wallets }: {
  change: TemplateChange
  categories: { _id: string; name: string }[]
  wallets: { _id: string; name: string; currency: string }[]
}) {
  const resolveValue = (field: string, value: string | number | undefined): string => {
    if (value === undefined || value === '') return '(empty)'
    if (field === 'categoryId') {
      const cat = categories.find(c => c._id === value)
      return cat ? cat.name : String(value)
    }
    if (field === 'walletId' || field === 'toWalletId') {
      const wallet = wallets.find(w => w._id === value)
      return wallet ? `${wallet.name} (${wallet.currency})` : String(value)
    }
    return String(value)
  }

  return (
    <li className="text-sm">
      <span className="font-medium">{change.label}</span>:{' '}
      <span className="text-muted-foreground">{resolveValue(change.field, change.from)}</span>
      {' → '}
      <span>{resolveValue(change.field, change.to)}</span>
    </li>
  )
}

export function LogPaymentDrawer({
  open,
  onOpenChange,
  payment,
  onSuccess,
}: LogPaymentDrawerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingChanges, setPendingChanges] = useState<TemplateChange[] | null>(null)
  const [isUpdatingTemplate, setIsUpdatingTemplate] = useState(false)
  const { categories } = useLiveCategories()
  const { wallets } = useLiveWallets()

  const prefillTransaction = useMemo(() => {
    if (!payment) return null
    const { recurring, scheduledDate } = payment
    return {
      _id: '',
      type: 'transaction' as const,
      transactionType: recurring.transactionType,
      amount: recurring.amount,
      currency: recurring.currency,
      categoryId: recurring.categoryId,
      walletId: recurring.walletId,
      toWalletId: recurring.toWalletId,
      note: recurring.description,
      date: scheduledDate.toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }, [payment])

  const { form, resetToDefaults } = useTransactionForm(prefillTransaction)

  const closeDrawer = useCallback(() => {
    onOpenChange(false)
    resetToDefaults()
    onSuccess?.()
  }, [onOpenChange, resetToDefaults, onSuccess])

  const handleSubmit = async (data: CreateTransaction) => {
    if (!payment) return

    setIsSubmitting(true)
    try {
      await recurringPaymentService.logRecurringPayment(
        payment.recurring._id,
        payment.scheduledDate,
        data
      )

      const changes = detectTemplateChanges(payment.recurring, data)
      if (changes.length > 0) {
        setPendingChanges(changes)
      } else {
        closeDrawer()
      }
    } catch (error) {
      console.error('Failed to log recurring payment:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdateTemplate = async () => {
    if (!payment || !pendingChanges) return

    setIsUpdatingTemplate(true)
    try {
      const updates: Record<string, unknown> = {}
      for (const change of pendingChanges) {
        if (change.field === 'description') {
          updates[change.field] = change.to ?? ''
        } else {
          updates[change.field] = change.to
        }
      }
      await recurringPaymentService.updateRecurringPaymentDetails(
        payment.recurring._id,
        updates
      )
    } catch (error) {
      console.error('Failed to update recurring payment template:', error)
    } finally {
      setIsUpdatingTemplate(false)
      setPendingChanges(null)
      closeDrawer()
    }
  }

  const handleKeepAsIs = () => {
    setPendingChanges(null)
    closeDrawer()
  }

  if (!payment) return null

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-sm">
            <DrawerHeader>
              <DrawerTitle>Log Payment</DrawerTitle>
              <DrawerDescription>
                Scheduled for {format(payment.scheduledDate, 'MMM d, yyyy')}
              </DrawerDescription>
            </DrawerHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="px-4 max-h-[50vh] overflow-y-auto">
                <div className="space-y-4 pb-6">
                  <TransactionForm isSubmitting={isSubmitting} />
                </div>
              </form>
            </Form>
            <DrawerFooter>
              <Button
                type="submit"
                onClick={form.handleSubmit(handleSubmit)}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Log Payment'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={pendingChanges !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update recurring payment?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-2">
                  You changed the following fields. Would you like to update the recurring payment template for future occurrences?
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  {pendingChanges?.map(change => (
                    <ChangeLabel
                      key={change.field}
                      change={change}
                      categories={categories}
                      wallets={wallets}
                    />
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleKeepAsIs} disabled={isUpdatingTemplate}>
              Keep as is
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleUpdateTemplate} disabled={isUpdatingTemplate}>
              {isUpdatingTemplate ? 'Updating...' : 'Update'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
