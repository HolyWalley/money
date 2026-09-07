import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Form } from '@/components/ui/form'
import { useTransactionForm } from '@/hooks/useTransactionForm'
import { AmountInput } from './AmountInput'
import type { Transaction } from '../../../shared/schemas/transaction.schema'

const mocks = vi.hoisted(() => ({
  user: { settings: { defaultCurrency: 'USD' } },
  wallets: [{ _id: 'w1', name: 'Cash', currency: 'USD' }],
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user }),
}))

vi.mock('@/hooks/useLiveWallets', () => ({
  useLiveWallets: () => mocks.wallets,
}))

function EditForm({ transaction }: { transaction: Transaction }) {
  const { form } = useTransactionForm(transaction)
  return (
    <Form {...form}>
      <AmountInput isSubmitting={false} size="full" />
    </Form>
  )
}

describe('AmountInput', () => {
  // The input keeps its own text and reads the form once, as it mounts. The
  // drawer mounts it in the same render as the form, so the transaction has
  // to be in the form before any effect has run.
  it('shows the amount of the transaction being edited', () => {
    const transaction = {
      _id: 't1',
      transactionType: 'expense',
      amount: 12.5,
      currency: 'USD',
      categoryId: 'c1',
      walletId: 'w1',
      date: '2026-01-01T00:00:00.000Z',
    } as Transaction

    render(<EditForm transaction={transaction} />)

    expect(screen.getByDisplayValue('12.5')).toBeInTheDocument()
  })
})
