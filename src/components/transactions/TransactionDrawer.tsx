import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Form } from '@/components/ui/form'
import { TransactionForm } from './TransactionForm'
import { useTransactionForm } from '@/hooks/useTransactionForm'
import { type CreateTransaction, type Transaction } from '../../../shared/schemas/transaction.schema'

interface TransactionDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction?: Transaction | null
  onSubmit: (data: CreateTransaction) => Promise<void>
}

export function TransactionDrawer({ open, onOpenChange, transaction, onSubmit }: TransactionDrawerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { form, resetToDefaults } = useTransactionForm(transaction)

  const handleSubmit = async (data: CreateTransaction) => {
    setIsSubmitting(true)
    try {
      await onSubmit(data)
      onOpenChange(false)
      resetToDefaults()
    } catch (error) {
      console.error(`Failed to ${transaction ? 'update' : 'create'} transaction:`, error)
      console.error('Form errors:', form.formState.errors)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-sm">
          <DrawerHeader>
            <DrawerTitle>{transaction ? 'Edit Transaction' : 'New Transaction'}</DrawerTitle>
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
              {isSubmitting ? 'Saving...' : transaction ? 'Update' : 'Save'}
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
