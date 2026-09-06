import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { WalletCard } from './WalletCard'
import type { Wallet } from '../../../shared/schemas/wallet.schema'

// The card is a drag handle in the list it normally lives in, and neither the
// drag nor the ledger read is what these tests are about.
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => undefined } },
}))

vi.mock('@/hooks/useWalletBalance', () => ({
  useWalletBalance: () => ({ balance: 3.39, isLoading: false }),
}))

const wallet: Wallet = {
  _id: 'wallet-1',
  type: 'wallet',
  name: 'Degiro',
  currency: 'EUR',
  initialBalance: 0,
  isSavings: false,
  order: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

function renderCard(props: Partial<Parameters<typeof WalletCard>[0]> = {}) {
  return render(
    <WalletCard wallet={wallet} onEdit={() => {}} onDelete={() => {}} {...props} />
  )
}

describe('WalletCard', () => {
  it('states the balance of an ordinary wallet', () => {
    renderCard()

    expect(screen.getByText('€3.39')).toBeInTheDocument()
    expect(screen.getByText('Current balance')).toBeInTheDocument()
  })

  // Such a wallet moves with no transaction behind it to point at: the
  // statement is stored as trades and the balance is derived from them, so the
  // card has to say where the figure comes from or it reads as a ledger with
  // rows missing.
  it('says whose cash it holds, and what the figure already answers for', () => {
    renderCard({ brokerName: 'Degiro' })

    expect(screen.getByText('Cash at Degiro, after imported trades')).toBeInTheDocument()
    expect(screen.queryByText('Current balance')).not.toBeInTheDocument()
    expect(screen.getByLabelText("Holds Degiro's cash")).toBeInTheDocument()
  })

  it('marks nothing on a wallet no broker keeps its cash in', () => {
    renderCard()

    expect(screen.queryByLabelText(/cash$/)).not.toBeInTheDocument()
  })
})
