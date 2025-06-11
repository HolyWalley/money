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
import { useDatabase } from '@/contexts/DatabaseContext'
import { useAuth } from '@/contexts/AuthContext'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { createTransactionSchema, type CreateTransaction } from '../../../shared/schemas/transaction.schema'

interface TransactionDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TransactionDrawer({ open, onOpenChange }: TransactionDrawerProps) {
  const { transactionService } = useDatabase()
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

  // Set default wallet when wallets are loaded
  useEffect(() => {
    if (wallets.length > 0 && !form.watch('walletId')) {
      form.setValue('walletId', wallets[0]._id)
    }
  }, [wallets, form])

  const handleSubmit = async (data: CreateTransaction) => {
    if (!transactionService || !user) return

    setIsSubmitting(true)
    try {
      console.log('Submitting transaction data:', data)
      await transactionService.createTransaction(user.userId, data)
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
      console.error('Failed to create transaction:', error)
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
            <DrawerTitle>New Transaction</DrawerTitle>
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
              {isSubmitting ? 'Saving...' : 'Save'}
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
