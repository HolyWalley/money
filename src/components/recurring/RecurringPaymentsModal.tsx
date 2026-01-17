import { useState, useMemo } from 'react'
import { ResponsiveModal } from '@/components/ui/responsive-modal'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import { RecurringPaymentItem } from './RecurringPaymentItem'
import { RecurringPaymentEditDrawer } from './RecurringPaymentEditDrawer'
import { useLiveRecurringPayments } from '@/hooks/useLiveRecurringPayments'
import { useLiveCategories } from '@/hooks/useLiveCategories'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { recurringPaymentService } from '@/services/recurringPaymentService'
import type { RecurringPayment } from '../../../shared/schemas/recurring-payment.schema'

interface RecurringPaymentsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RecurringPaymentsModal({
  open,
  onOpenChange,
}: RecurringPaymentsModalProps) {
  const [editingPayment, setEditingPayment] = useState<RecurringPayment | null>(null)
  const [deletingPayment, setDeletingPayment] = useState<RecurringPayment | null>(null)

  const { recurringPayments, isLoading } = useLiveRecurringPayments()
  const { categories } = useLiveCategories()
  const { wallets } = useLiveWallets()

  const categoriesMap = useMemo(() => {
    return new Map(categories.map(c => [c._id, c]))
  }, [categories])

  const walletsMap = useMemo(() => {
    return new Map(wallets.map(w => [w._id, w]))
  }, [wallets])

  const handleEdit = (payment: RecurringPayment) => {
    setEditingPayment(payment)
  }

  const handleDelete = (payment: RecurringPayment) => {
    setDeletingPayment(payment)
  }

  const handleConfirmDelete = async () => {
    if (!deletingPayment) return

    try {
      await recurringPaymentService.deactivateRecurringPayment(deletingPayment._id)
    } catch (error) {
      console.error('Failed to deactivate recurring payment:', error)
    } finally {
      setDeletingPayment(null)
    }
  }

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        title="Recurring Payments"
      >
        <div className="pb-4 md:pb-0">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              Loading...
            </div>
          ) : recurringPayments.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No recurring payments set up yet.
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <div className="divide-y divide-border/50">
                {recurringPayments.map((payment) => (
                  <RecurringPaymentItem
                    key={payment._id}
                    payment={payment}
                    category={categoriesMap.get(payment.categoryId)}
                    wallet={walletsMap.get(payment.walletId)}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </ResponsiveModal>

      <RecurringPaymentEditDrawer
        open={!!editingPayment}
        onOpenChange={(open) => !open && setEditingPayment(null)}
        payment={editingPayment}
      />

      <ConfirmationDialog
        open={!!deletingPayment}
        onOpenChange={(open) => !open && setDeletingPayment(null)}
        title="Delete Recurring Payment"
        description={`Are you sure you want to delete "${deletingPayment?.description || 'this payment'}"? This will stop future occurrences from appearing.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
      />
    </>
  )
}
