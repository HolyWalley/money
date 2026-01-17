import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer'
import { Form } from '@/components/ui/form'
import { TransactionForm } from '@/components/transactions/TransactionForm'
import { useTransactionForm } from '@/hooks/useTransactionForm'
import { recurringPaymentService } from '@/services/recurringPaymentService'
import type { UpcomingPayment } from '@/hooks/useUpcomingPayments'
import type { CreateTransaction } from '../../../shared/schemas/transaction.schema'
import { format } from 'date-fns'

interface LogPaymentDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  payment: UpcomingPayment | null
  onSuccess?: () => void
}

export function LogPaymentDrawer({
  open,
  onOpenChange,
  payment,
  onSuccess,
}: LogPaymentDrawerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

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

  const handleSubmit = async (data: CreateTransaction) => {
    if (!payment) return

    setIsSubmitting(true)
    try {
      await recurringPaymentService.logRecurringPayment(
        payment.recurring._id,
        payment.scheduledDate,
        data
      )

      onOpenChange(false)
      resetToDefaults()
      onSuccess?.()
    } catch (error) {
      console.error('Failed to log recurring payment:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!payment) return null

  return (
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
  )
}
