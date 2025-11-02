import { useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/contexts/AuthContext'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { createTransactionSchema, type CreateTransaction, type Transaction } from '../../shared/schemas/transaction.schema'
import { type Currency } from '../../shared/schemas/user_settings.schema'

export function useTransactionForm(transaction?: Transaction | null) {
  const { user } = useAuth()
  const { wallets } = useLiveWallets()

  const form = useForm<CreateTransaction>({
    resolver: zodResolver(createTransactionSchema),
    defaultValues: {
      transactionType: 'expense',
      amount: undefined as unknown as number,
      currency: (user?.settings?.defaultCurrency || 'USD') as Currency,
      note: '',
      walletId: '',
      date: new Date().toISOString(),
      split: false,
      parts: [],
    },
  })

  const getDefaultValues = useCallback(() => ({
    transactionType: 'expense' as const,
    amount: undefined as unknown as number,
    currency: (user?.settings?.defaultCurrency || 'USD') as Currency,
    note: '',
    walletId: wallets[0]?._id || '',
    date: new Date().toISOString(),
    split: false,
    parts: [],
  }), [user, wallets])

  const resetToDefaults = useCallback(() => {
    form.reset(getDefaultValues())
  }, [form, getDefaultValues])

  // Initialize form based on transaction prop
  useEffect(() => {
    if (transaction) {
      // Editing mode - populate with transaction data
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
        split: transaction.split,
        parts: transaction.parts,
        reimbursement: transaction.reimbursement,
      })
    } else if (!transaction && wallets.length > 0) {
      // Creating mode - set defaults with first wallet
      form.reset({
        transactionType: 'expense',
        amount: undefined as unknown as number,
        currency: wallets[0]?.currency || (user?.settings?.defaultCurrency || 'USD') as Currency,
        note: '',
        walletId: wallets[0]?._id || '',
        date: new Date().toISOString(),
        split: false,
        parts: [],
      })
    }
  }, [transaction, form, user, wallets])

  // Set default wallet when wallets are loaded (only for new transactions)
  useEffect(() => {
    if (!transaction && wallets.length > 0) {
      const currentWalletId = form.getValues('walletId')
      if (!currentWalletId) {
        const defaultWallet = wallets[0]
        form.setValue('walletId', defaultWallet._id)
        form.setValue('currency', defaultWallet.currency)
      }
    }
  }, [wallets, form, transaction])

  return {
    form,
    resetToDefaults,
  }
}
