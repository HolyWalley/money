import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { UpcomingPaymentCard } from './UpcomingPaymentCard'
import type { UpcomingPayment } from '@/hooks/useUpcomingPayments'
import type { Category } from '../../../shared/schemas/category.schema'
import type { Wallet } from '../../../shared/schemas/wallet.schema'

const categories: Category[] = []

const wallets: Wallet[] = [{
  _id: 'w-1',
  type: 'wallet',
  name: 'Everyday',
  currency: 'EUR',
  initialBalance: 0,
  isSavings: false,
  order: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}]

function makePayment(savedAmount: number): UpcomingPayment {
  return {
    recurring: {
      _id: 'rp-1',
      amount: 1200,
      currency: 'EUR',
      categoryId: 'c-1',
      walletId: 'w-1',
      transactionType: 'expense',
      description: 'Rent',
      rrule: 'FREQ=MONTHLY;INTERVAL=1',
      startDate: '2026-01-05T00:00:00.000Z',
      isActive: true,
      sourceTransactionId: 't-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    scheduledDate: new Date('2026-10-05T00:00:00.000Z'),
    logId: 'rp-1_2026-10-05',
    status: 'upcoming',
    savedAmount,
  }
}

function renderCard(savedAmount: number) {
  render(
    <UpcomingPaymentCard
      payment={makePayment(savedAmount)}
      categories={categories}
      wallets={wallets}
      onLog={vi.fn()}
      onSkip={vi.fn()}
    />
  )
}

describe('UpcomingPaymentCard', () => {
  it('shows what is already saved alongside the amount due', () => {
    renderCard(800)

    expect(screen.getByText('800.00 saved')).toBeInTheDocument()
  })

  // Logging the payment prefills the full amount, so the headline number has to
  // stay the amount of the transaction that is about to be created.
  it('keeps the full payment amount on the card', () => {
    renderCard(800)

    expect(screen.getByText('-1200.00 EUR')).toBeInTheDocument()
  })

  it('says nothing when no money is put aside for the payment', () => {
    renderCard(0)

    expect(screen.queryByText(/saved/)).not.toBeInTheDocument()
  })
})
