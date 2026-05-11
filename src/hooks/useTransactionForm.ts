import { useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/contexts/AuthContext'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { createTransactionSchema, type CreateTransaction, type Transaction } from '../../shared/schemas/transaction.schema'
import { type Currency } from '../../shared/schemas/user_settings.schema'

export function useTransactionForm(
  transaction?: Transaction | null,
  initialValues?: Partial<CreateTransaction>,
) {
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
      ...(initialValues ?? {}),
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

  const initialValuesKey = initialValues ? JSON.stringify(initialValues) : ''

  useEffect(() => {
    if (transaction) {
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
      form.reset({
        transactionType: 'expense',
        amount: undefined as unknown as number,
        currency: wallets[0]?.currency || (user?.settings?.defaultCurrency || 'USD') as Currency,
        note: '',
        walletId: wallets[0]?._id || '',
        date: new Date().toISOString(),
        split: false,
        parts: [],
        ...(initialValues ?? {}),
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transaction, form, user, wallets, initialValuesKey])

  useEffect(() => {
    if (!transaction && wallets.length > 0) {
      const currentWalletId = form.getValues('walletId')
      if (!currentWalletId) {
        const defaultWallet = wallets[0]
        form.setValue('walletId', defaultWallet._id)
        if (!initialValues?.currency) {
          form.setValue('currency', defaultWallet.currency)
        }
      }
    }
  }, [wallets, form, transaction, initialValues?.currency])

  return {
    form,
    resetToDefaults,
  }
}
