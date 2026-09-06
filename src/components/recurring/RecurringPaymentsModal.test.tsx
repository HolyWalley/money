import { act, render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { deferred, type Deferred } from '@/lib/suspense'
import { RecurringPaymentsModal } from './RecurringPaymentsModal'
import type { RecurringPayment } from '../../../shared/schemas/recurring-payment.schema'

const mocks = vi.hoisted(() => ({
  recurringPayments: null as unknown as { promise: Promise<RecurringPayment[]> },
}))

// Reads the way the real hook does: suspends until the store answers.
vi.mock('@/hooks/useLiveRecurringPayments', async () => {
  const { use } = await import('react')
  return { useLiveRecurringPayments: () => use(mocks.recurringPayments.promise) }
})
vi.mock('@/hooks/useLiveCategories', () => ({ useLiveCategories: () => [] }))
vi.mock('@/hooks/useLiveWallets', () => ({ useLiveWallets: () => [] }))

vi.mock('@/services/recurringPaymentService', () => ({ recurringPaymentService: {} }))
vi.mock('./RecurringPaymentEditDrawer', () => ({ RecurringPaymentEditDrawer: () => null }))
vi.mock('./RecurringPaymentItem', () => ({
  RecurringPaymentItem: ({ payment }: { payment: RecurringPayment }) => <div>{payment.description}</div>,
}))

let recurringPayments: Deferred<RecurringPayment[]>

describe('RecurringPaymentsModal', () => {
  beforeEach(() => {
    recurringPayments = deferred<RecurringPayment[]>()
    mocks.recurringPayments = recurringPayments
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  })

  it('opens at once and spins until the payments answer', async () => {
    await act(async () => {
      render(<RecurringPaymentsModal open onOpenChange={vi.fn()} />)
    })

    expect(screen.getByText('Recurring Payments')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    expect(screen.queryByText('Rent')).not.toBeInTheDocument()

    await act(async () => {
      recurringPayments.resolve([{ _id: 'rp1', description: 'Rent' } as RecurringPayment])
    })

    expect(screen.getByText('Rent')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows a failed read inside the drawer', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    recurringPayments.reject(new Error('index missing'))

    await act(async () => {
      render(<RecurringPaymentsModal open onOpenChange={vi.fn()} />)
    })

    expect(screen.getByText('Recurring Payments')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('This could not be read')
    consoleError.mockRestore()
  })
})
