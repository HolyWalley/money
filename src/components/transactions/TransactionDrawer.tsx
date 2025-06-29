import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { TransactionForm } from './TransactionForm'
import { transactionService } from '@/services/transactionService'
import { useAuth } from '@/contexts/AuthContext'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { createTransactionSchema, type CreateTransaction, type Transaction } from '../../../shared/schemas/transaction.schema'

interface TransactionDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction?: Transaction | null
}

export function TransactionDrawer({ open, onOpenChange, transaction }: TransactionDrawerProps) {
  const { user } = useAuth()
  const { wallets } = useLiveWallets()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<CreateTransaction>({
    resolver: zodResolver(createTransactionSchema),
    defaultValues: {
      transactionType: 'expense',
      amount: undefined as unknown as number,
      currency: (user?.settings?.defaultCurrency || 'USD') as 'USD' | 'EUR' | 'PLN',
      note: '',
      walletId: '',
      date: new Date().toISOString(),
    },
  })

  // Reset form when drawer opens/closes or transaction changes
  useEffect(() => {
    if (open) {
      if (transaction) {
        // Editing mode - form will be populated by TransactionForm component
        form.reset({
          transactionType: transaction.transactionType,
          amount: transaction.amount,
          currency: transaction.currency,
          note: transaction.note || '',
          walletId: transaction.walletId,
          toWalletId: transaction.toWalletId,
          toAmount: transaction.toAmount,
          toCurrency: transaction.toCurrency,
          categoryId: transaction.categoryId,
          date: transaction.date,
        })
      } else {
        // Creating mode - reset to defaults
        form.reset({
          transactionType: 'expense',
          amount: undefined as unknown as number,
          currency: (user?.settings?.defaultCurrency || 'USD') as 'USD' | 'EUR' | 'PLN',
          note: '',
          walletId: wallets[0]?._id || '',
          date: new Date().toISOString(),
        })
      }
    }
  }, [open, transaction, form, user, wallets])

  // Set default wallet when wallets are loaded (only for new transactions)
  useEffect(() => {
    if (!transaction && wallets.length > 0 && !form.watch('walletId')) {
      const defaultWallet = wallets[0]
      form.setValue('walletId', defaultWallet._id)
      form.setValue('currency', defaultWallet.currency)
    }
  }, [wallets, form, transaction])

  const handleSubmit = async (data: CreateTransaction) => {
    if (!user) return

    setIsSubmitting(true)
    try {
      console.log('Submitting transaction data:', data)
      if (transaction) {
        await transactionService.updateTransaction(transaction._id, data)
      } else {
        await transactionService.createTransaction(data)
      }
      onOpenChange(false)
      form.reset({
        transactionType: 'expense',
        amount: undefined as unknown as number,
        currency: (user?.settings?.defaultCurrency || 'USD') as 'USD' | 'EUR' | 'PLN',
        note: '',
        walletId: wallets[0]?._id || '',
        date: new Date().toISOString(),
      })
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
          <div className="px-4 max-h-[50vh] overflow-y-auto">
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 pb-6">
              <TransactionForm form={form} isSubmitting={isSubmitting} />
            </form>
          </div>
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
