import { useEffect, useCallback, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/contexts/AuthContext'
import { useLiveWallets } from '@/hooks/useLiveWallets'
import { formDefaults, resolveWalletDefaults } from '@/lib/form-defaults'
import { createTransactionSchema, type CreateTransaction, type Transaction } from '../../shared/schemas/transaction.schema'
import { type Currency } from '../../shared/schemas/user_settings.schema'

export function useTransactionForm(
  transaction?: Transaction | null,
  initialValues?: Partial<CreateTransaction>,
) {
  const { user } = useAuth()
  const { wallets } = useLiveWallets()
  const defaultCurrency = (user?.settings?.defaultCurrency || 'USD') as Currency

  const form = useForm<CreateTransaction>({
    resolver: zodResolver(createTransactionSchema),
    defaultValues: {
      transactionType: 'expense',
      amount: undefined as unknown as number,
      currency: defaultCurrency,
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
    note: '',
    // Falls back to now once the remembered date is no longer from today.
    date: formDefaults.loadDate() ?? new Date().toISOString(),
    split: false,
    parts: [],
    ...resolveWalletDefaults('expense', wallets, defaultCurrency),
  }), [defaultCurrency, wallets])

  const resetToDefaults = useCallback(() => {
    form.reset(getDefaultValues())
  }, [form, getDefaultValues])

  // Clears what belongs to one transaction and keeps what belongs to the
  // sitting: the type, the wallets it implies, and the date being logged for.
  const resetForNextEntry = useCallback(() => {
    const current = form.getValues()
    form.reset({
      transactionType: current.transactionType,
      walletId: current.walletId,
      toWalletId: current.toWalletId,
      currency: current.currency,
      toCurrency: current.toCurrency,
      date: current.date,
      amount: undefined as unknown as number,
      toAmount: undefined,
      categoryId: undefined,
      note: '',
      split: false,
      parts: [],
      reimbursement: undefined,
    })
  }, [form])

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
        ...getDefaultValues(),
        ...(initialValues ?? {}),
      })
    }
    // Tracks the currency rather than the whole user: a new `user` object
    // identity would reset the form, re-render, and reset it again. Same for
    // `initialValues`, compared by content through `initialValuesKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transaction, form, getDefaultValues, initialValuesKey])

  // Each type is logged from its own wallet, so switching type brings that
  // type's remembered wallet with it. The first run only records where the
  // form started, since the reset above already placed it.
  const transactionType = form.watch('transactionType')
  const appliedType = useRef<CreateTransaction['transactionType'] | null>(null)

  useEffect(() => {
    if (transaction || wallets.length === 0) return

    if (appliedType.current === null || appliedType.current === transactionType) {
      appliedType.current = transactionType
      return
    }
    appliedType.current = transactionType

    const next = resolveWalletDefaults(transactionType, wallets, defaultCurrency)
    form.setValue('walletId', next.walletId)
    form.setValue('currency', next.currency)
    if (transactionType === 'transfer') {
      form.setValue('toWalletId', next.toWalletId)
      form.setValue('toCurrency', next.toCurrency)
    }
  }, [transactionType, transaction, wallets, defaultCurrency, form])

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
    resetForNextEntry,
  }
}
