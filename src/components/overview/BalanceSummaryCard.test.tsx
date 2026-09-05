import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BalanceSummaryCard, type CommittedAmounts } from './BalanceSummaryCard'

function renderCard(overrides: {
  total?: number
  spendable?: number
  savings?: number
  commitments?: CommittedAmounts | null
  missingCurrencies?: string[]
} = {}) {
  return render(
    <BalanceSummaryCard
      total={overrides.total ?? 12480.3}
      spendable={overrides.spendable ?? 4230.1}
      savings={overrides.savings ?? 8250.2}
      baseCurrency="EUR"
      commitments={overrides.commitments ?? null}
      missingCurrencies={overrides.missingCurrencies ?? []}
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
})
