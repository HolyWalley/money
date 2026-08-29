import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useTransactionForm } from './useTransactionForm'
import { formDefaults } from '@/lib/form-defaults'
import type { Transaction } from '../../shared/schemas/transaction.schema'

const mocks = vi.hoisted(() => ({
  // One object for the whole file: a fresh `user` identity on every render
  // would restart the form's reset effect in a loop.
  user: { settings: { defaultCurrency: 'PLN' } },
  wallets: [
    { _id: 'w1', name: 'Cash', currency: 'USD' },
    { _id: 'w2', name: 'Revolut', currency: 'EUR' },
    { _id: 'w3', name: 'Savings', currency: 'PLN' },
  ],
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user }),
}))

vi.mock('@/hooks/useLiveWallets', () => ({
  useLiveWallets: () => ({ wallets: mocks.wallets, isLoading: false }),
}))

describe('useTransactionForm', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts on the first wallet when nothing is remembered', async () => {
    const { result } = renderHook(() => useTransactionForm())

    await waitFor(() => expect(result.current.form.getValues('walletId')).toBe('w1'))
    expect(result.current.form.getValues('currency')).toBe('USD')
  })

  it('starts on the wallet last used for this type', async () => {
    formDefaults.saveWallet('expense', { walletId: 'w2' })

    const { result } = renderHook(() => useTransactionForm())

    await waitFor(() => expect(result.current.form.getValues('walletId')).toBe('w2'))
    expect(result.current.form.getValues('currency')).toBe('EUR')
  })

  it('brings the remembered wallet along when the type changes', async () => {
    formDefaults.saveWallet('expense', { walletId: 'w1' })
    formDefaults.saveWallet('income', { walletId: 'w3' })

    const { result } = renderHook(() => useTransactionForm())
    await waitFor(() => expect(result.current.form.getValues('walletId')).toBe('w1'))

    act(() => result.current.form.setValue('transactionType', 'income'))

    await waitFor(() => expect(result.current.form.getValues('walletId')).toBe('w3'))
    expect(result.current.form.getValues('currency')).toBe('PLN')
  })

  it('restores both sides when the type changes to transfer', async () => {
    formDefaults.saveWallet('transfer', { walletId: 'w2', toWalletId: 'w3' })

    const { result } = renderHook(() => useTransactionForm())
    await waitFor(() => expect(result.current.form.getValues('walletId')).toBe('w1'))

    act(() => result.current.form.setValue('transactionType', 'transfer'))

    await waitFor(() => expect(result.current.form.getValues('walletId')).toBe('w2'))
    expect(result.current.form.getValues('toWalletId')).toBe('w3')
    expect(result.current.form.getValues('toCurrency')).toBe('PLN')
  })

  it('starts on a date remembered earlier the same day', async () => {
    formDefaults.saveDate('2026-08-27T00:00:00.000Z')

    const { result } = renderHook(() => useTransactionForm())

    await waitFor(() => expect(result.current.form.getValues('date')).toBe('2026-08-27T00:00:00.000Z'))
  })

  it('starts on today once the remembered date is from a past day', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 29, 10, 0))
    formDefaults.saveDate('2026-08-27T00:00:00.000Z')
    vi.setSystemTime(new Date(2026, 7, 30, 10, 0))

    const { result } = renderHook(() => useTransactionForm())

    await waitFor(() => expect(result.current.form.getValues('walletId')).toBe('w1'))
    expect(result.current.form.getValues('date')).toBe(new Date(2026, 7, 30, 10, 0).toISOString())
  })

  it('ignores remembered defaults while editing a transaction', async () => {
    formDefaults.saveWallet('expense', { walletId: 'w2' })
    const transaction = {
      _id: 't1',
      transactionType: 'expense',
      amount: 12,
      currency: 'PLN',
      categoryId: 'c1',
      walletId: 'w3',
      date: '2026-01-01T00:00:00.000Z',
    } as Transaction

    const { result } = renderHook(() => useTransactionForm(transaction))

    await waitFor(() => expect(result.current.form.getValues('walletId')).toBe('w3'))
    expect(result.current.form.getValues('date')).toBe('2026-01-01T00:00:00.000Z')
  })

  describe('resetForNextEntry', () => {
    it('keeps the type, wallet and date, and clears the entry', async () => {
      const { result } = renderHook(() => useTransactionForm())
      await waitFor(() => expect(result.current.form.getValues('walletId')).toBe('w1'))

      act(() => result.current.form.setValue('transactionType', 'income'))
      await waitFor(() => expect(result.current.form.getValues('transactionType')).toBe('income'))

      act(() => {
        result.current.form.setValue('walletId', 'w2')
        result.current.form.setValue('currency', 'EUR')
        result.current.form.setValue('date', '2026-08-27T00:00:00.000Z')
        result.current.form.setValue('amount', 42)
        result.current.form.setValue('note', 'Coffee')
        result.current.form.setValue('categoryId', 'c1')
      })

      act(() => result.current.resetForNextEntry())

      const values = result.current.form.getValues()
      expect(values.transactionType).toBe('income')
      expect(values.walletId).toBe('w2')
      expect(values.currency).toBe('EUR')
      expect(values.date).toBe('2026-08-27T00:00:00.000Z')
      expect(values.amount).toBeUndefined()
      expect(values.note).toBe('')
      expect(values.categoryId).toBeUndefined()
    })

    it('clears the second side of a transfer', async () => {
      const { result } = renderHook(() => useTransactionForm())
      await waitFor(() => expect(result.current.form.getValues('walletId')).toBe('w1'))

      act(() => result.current.form.setValue('transactionType', 'transfer'))
      await waitFor(() => expect(result.current.form.getValues('transactionType')).toBe('transfer'))

      act(() => {
        result.current.form.setValue('toWalletId', 'w3')
        result.current.form.setValue('toAmount', 42)
      })

      act(() => result.current.resetForNextEntry())

      expect(result.current.form.getValues('toWalletId')).toBe('w3')
      expect(result.current.form.getValues('toAmount')).toBeUndefined()
    })
  })
})
