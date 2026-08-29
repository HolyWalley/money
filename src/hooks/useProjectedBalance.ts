import { useFormContext } from 'react-hook-form'
import { useWalletBalance } from './useWalletBalance'
import { projectWalletBalance, type BalanceTransaction } from '@/lib/wallet-balance'
import type { CreateTransaction, Transaction } from '../../shared/schemas/transaction.schema'

const toFiniteAmount = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

export function useProjectedBalance(walletId: string | undefined, transaction?: Transaction | null) {
  const form = useFormContext<CreateTransaction>()

  const transactionType = form.watch('transactionType')
  const amount = form.watch('amount')
  const toAmount = form.watch('toAmount')
  const currency = form.watch('currency')
  const toCurrency = form.watch('toCurrency')
  const fromWalletId = form.watch('walletId')
  const toWalletId = form.watch('toWalletId')

  const { balance, isLoading } = useWalletBalance(walletId || '')

  const pending: BalanceTransaction = {
    transactionType,
    amount: toFiniteAmount(amount) ?? 0,
    currency,
    walletId: fromWalletId,
    toWalletId,
    toAmount: toFiniteAmount(toAmount),
    toCurrency,
  }

  const projected = walletId
    ? projectWalletBalance(balance, walletId, pending, transaction ?? null)
    : balance

  return {
    current: balance,
    projected,
    isLoading,
    hasChange: projected !== balance,
  }
}
