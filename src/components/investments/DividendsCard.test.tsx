import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { DividendsCard } from './DividendsCard'
import type { MonthlyDividend } from '@/lib/dividend-history'

const asOf = new Date('2026-03-15T00:00:00.000Z')

const PAID: MonthlyDividend[] = [
  { year: 2024, month: 5, amount: 0.1 },
  { year: 2025, month: 0, amount: 46.4 },
  { year: 2025, month: 6, amount: 9.5 },
  { year: 2026, month: 0, amount: 33.5 },
]

function renderCard(months = PAID, missingCurrencies: string[] = []) {
  return render(
    <DividendsCard
      months={months}
      missingCurrencies={missingCurrencies}
      baseCurrency="EUR"
      asOf={asOf}
    />
  )
}

describe('DividendsCard', () => {
  // Accumulating ETFs pay nothing by design, and an empty chart of nothing says
  // less than no chart at all.
  it('says nothing where nothing has ever been paid', () => {
    const { container } = renderCard([])

    expect(container).toBeEmptyDOMElement()
  })

  it('adds up everything ever paid, and lists the years it was paid in', () => {
    renderCard()

    expect(screen.getByText(/89.50 EUR in total/)).toBeInTheDocument()
    for (const label of ['All', 'TTM', '2026', '2025', '2024']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('narrows the total to the year that is picked', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.click(screen.getByRole('button', { name: '2025' }))

    expect(screen.getByText(/55.90 EUR in 2025/)).toBeInTheDocument()
  })

  // In March, a calendar year holds three months of income and reads as a
  // collapse next to last year's twelve.
  it('rolls the last twelve months rather than cutting at January', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.click(screen.getByRole('button', { name: 'TTM' }))

    // April 2025 onwards: July's 9.50 and this January's 33.50.
    expect(screen.getByText(/43.00 EUR over the last year/)).toBeInTheDocument()
  })

  it('lays every month of every year out as a grid', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.click(screen.getByRole('button', { name: 'Heatmap' }))

    const grid = within(screen.getByRole('table'))
    expect(grid.getByRole('columnheader', { name: 'Jan' })).toBeInTheDocument()
    expect(grid.getByRole('rowheader', { name: '2026' })).toBeInTheDocument()
    expect(grid.getByText('46.40')).toBeInTheDocument()
    // A month nothing arrived in is empty rather than a zero.
    expect(grid.queryByText('0.00')).not.toBeInTheDocument()
  })

  it('marks which view and which window are being shown', async () => {
    const user = userEvent.setup()
    renderCard()

    expect(screen.getByRole('button', { name: 'Bar chart' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Heatmap' }))

    expect(screen.getByRole('button', { name: 'Heatmap' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Bar chart' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('says what it had to leave out for want of a rate', () => {
    renderCard(PAID, ['BRL'])

    expect(screen.getByText(/Leaves out what was paid in BRL/)).toBeInTheDocument()
  })
})

// recharts measures a container jsdom never lays out; the buckets it draws are
// covered where they are computed, in dividend-history.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  }
})
