import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BalanceSummaryCard, type CommittedAmounts } from './BalanceSummaryCard'

function renderCard(overrides: {
  total?: number
  spendable?: number
  savings?: number
  investments?: number | null
  commitments?: CommittedAmounts | null
  missingCurrencies?: string[]
  unvaluedHoldings?: number
  isLoading?: boolean
} = {}) {
  return render(
    <BalanceSummaryCard
      total={overrides.total ?? 12480.3}
      spendable={overrides.spendable ?? 4230.1}
      savings={overrides.savings ?? 8250.2}
      investments={overrides.investments ?? null}
      baseCurrency="EUR"
      commitments={overrides.commitments ?? null}
      missingCurrencies={overrides.missingCurrencies ?? []}
      unvaluedHoldings={overrides.unvaluedHoldings ?? 0}
      isLoading={overrides.isLoading ?? false}
    />
  )
}

const committed = (recurring: number, savings: number): CommittedAmounts => ({
  recurring,
  savings,
  total: recurring + savings,
})

describe('BalanceSummaryCard', () => {
  it('leads with net worth, grouped so it can be read at a glance', () => {
    renderCard()

    expect(screen.getByText('12,480.30')).toBeInTheDocument()
  })

  it('splits what is spendable from what is put away', () => {
    renderCard()

    expect(screen.getByText('4,230.10')).toBeInTheDocument()
    expect(screen.getByText('8,250.20')).toBeInTheDocument()
  })

  // Savings is money already spoken for; funding the month from it is how a
  // month ends up eating its own emergency fund.
  it('takes what is still owed out of spendable, never out of savings', () => {
    renderCard({ spendable: 4230.1, commitments: committed(940, 400) })

    expect(screen.getByText('2,890.10')).toBeInTheDocument()
  })

  it('says what the money is already promised to', () => {
    renderCard({ commitments: committed(940, 400) })

    expect(screen.getByText('Spendable, less 940.00 recurring and 400.00 to savings')).toBeInTheDocument()
  })

  it('does not mention a savings transfer that is not owed', () => {
    renderCard({ commitments: committed(940, 0) })

    expect(screen.getByText('Spendable, less 940.00 recurring')).toBeInTheDocument()
  })

  it('does not mention a recurring payment that is not owed', () => {
    renderCard({ commitments: committed(0, 400) })

    expect(screen.getByText('Spendable, less 400.00 to savings')).toBeInTheDocument()
  })

  it('says the period is settled when nothing is left to pay', () => {
    renderCard({ commitments: committed(0, 0) })

    expect(screen.getByText('Nothing left to pay this period')).toBeInTheDocument()
  })

  it('flags an overcommitted period rather than hiding it', () => {
    const { container } = renderCard({ spendable: 500, commitments: committed(900, 0) })

    expect(screen.getByText('-400.00')).toBeInTheDocument()
    expect(container.querySelector('.text-red-600')).not.toBeNull()
  })

  // Today's balance says nothing about a period we are not living in.
  it('leaves out what is free to spend when there is no period to spend it in', () => {
    renderCard({ commitments: null })

    expect(screen.queryByText('Free to spend')).not.toBeInTheDocument()
  })

  // A total that quietly drops a wallet reads as a smaller total rather than an
  // incomplete one.
  it('admits when a currency is missing from the total', () => {
    renderCard({ missingCurrencies: ['PLN', 'USD'] })

    expect(screen.getByText(/Excludes PLN, USD/)).toBeInTheDocument()
  })

  it('says nothing about missing rates when there are none', () => {
    renderCard()

    expect(screen.queryByText(/Excludes/)).not.toBeInTheDocument()
  })

  it('shows what is invested beside what is spendable and what is saved', () => {
    renderCard({ total: 14880.3, investments: 2400 })

    expect(screen.getByText('Investments')).toBeInTheDocument()
    expect(screen.getByText('2,400.00')).toBeInTheDocument()
    expect(screen.getByText('14,880.30')).toBeInTheDocument()
  })

  // A holding is not money until it is sold, so it must never fund the month.
  it('keeps what is free to spend clear of the portfolio', () => {
    renderCard({ spendable: 4230.1, investments: 90000, commitments: committed(940, 400) })

    expect(screen.getByText('2,890.10')).toBeInTheDocument()
  })

  it('shows an empty brokerage rather than pretending there is none', () => {
    renderCard({ investments: 0 })

    expect(screen.getByText('Investments')).toBeInTheDocument()
  })

  // The common case. Someone who invests through nobody must see exactly the
  // card they saw before any of this existed - no row, no zero, no note.
  it('is unchanged for someone with no brokerage at all', () => {
    const { container } = renderCard({ investments: null, commitments: committed(940, 400) })

    expect(screen.queryByText('Investments')).not.toBeInTheDocument()
    expect(container.textContent).toBe(
      'Net worth12,480.30 EURSpendable4,230.10Savings8,250.20Free to spend2,890.10 EURSpendable, less 940.00 recurring and 400.00 to savings'
    )
  })

  // Silently dropping a holding nothing could price reads as a smaller net
  // worth rather than an incomplete one.
  it('admits when a holding is missing from the total', () => {
    renderCard({ investments: 2400, unvaluedHoldings: 2 })

    expect(screen.getByText('Excludes 2 holdings — no current value available.')).toBeInTheDocument()
  })

  it('counts a single unvalued holding in the singular', () => {
    renderCard({ investments: 2400, unvaluedHoldings: 1 })

    expect(screen.getByText('Excludes 1 holding — no current value available.')).toBeInTheDocument()
  })

  // Two differently worded warnings read as two unrelated problems; these are
  // one - the total is partial - said twice.
  it('says a missing rate and an unvalued holding the same way', () => {
    renderCard({ investments: 2400, missingCurrencies: ['PLN'], unvaluedHoldings: 1 })

    expect(screen.getByText('Excludes PLN — no exchange rate available.')).toBeInTheDocument()
    expect(screen.getByText('Excludes 1 holding — no current value available.')).toBeInTheDocument()
  })

  it('says nothing about unvalued holdings when every one of them is priced', () => {
    renderCard({ investments: 2400, unvaluedHoldings: 0 })

    expect(screen.queryByText(/holding/)).not.toBeInTheDocument()
  })

  // The figures come from IndexedDB rather than the network, so this is a frame
  // or two - but a frame of "0.00" reads as being broke.
  it('waits rather than showing a figure it does not have yet', () => {
    renderCard({ isLoading: true })

    expect(screen.getByTestId('net-worth-loading')).toBeInTheDocument()
    expect(screen.queryByText(/12,480.30/)).not.toBeInTheDocument()
    expect(screen.queryByText('0.00')).not.toBeInTheDocument()
  })

  // A column that appears a frame late shifts the two beside it, so the space
  // is held whether or not there turns out to be a brokerage.
  it('holds the investments column while it is unknown whether there is one', () => {
    renderCard({ isLoading: true, investments: null })

    expect(screen.getByText('Investments')).toBeInTheDocument()
  })
})
