import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { PortfolioOverview } from './PortfolioOverview'
import type { HistoryPoint } from '@/lib/portfolio-history'
import type { Instrument } from '../../../shared/schemas/instrument.schema'

const asOf = new Date('2026-03-15T00:00:00.000Z')

function dayKey(offsetFromEnd: number): string {
  const date = new Date(asOf.getTime() - offsetFromEnd * 86400000)
  return date.toISOString().split('T')[0]
}

/**
 * A curve `days` long that grows steadily, ending on the given value and
 * return, so a test can name the figure it expects to read.
 */
function series(days: number, end: { value: number; invested: number; performance: number }) {
  const points: HistoryPoint[] = []

  for (let offset = days - 1; offset >= 0; offset--) {
    const progress = (days - 1 - offset) / Math.max(days - 1, 1)
    const value = end.invested + (end.value - end.invested) * progress
    points.push({
      date: dayKey(offset),
      value,
      invested: end.invested,
      gain: value - end.invested,
      // Everything was paid in on the first day, so the money-weighted rate
      // and the time-weighted one agree.
      flow: offset === days - 1 ? end.invested : 0,
      performance: end.performance * progress,
    })
  }

  return points
}

function makeInstrument(name: string, symbol?: string): Instrument {
  return {
    _id: name,
    type: 'instrument',
    name,
    symbol,
    currency: 'EUR',
    kind: 'etf',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  }
}

interface RenderOptions {
  points?: HistoryPoint[]
  unpriced?: Instrument[]
  isLoading?: boolean
  marketValue?: number
  hasHoldings?: boolean
  onImport?: () => void
}

function renderChart({
  points = series(400, { value: 12500, invested: 10000, performance: 0.25 }),
  unpriced = [],
  isLoading = false,
  marketValue = 12500,
  hasHoldings = true,
  onImport,
}: RenderOptions = {}) {
  return render(
    <PortfolioOverview
      points={points}
      unpriced={unpriced}
      marketValue={marketValue}
      hasHoldings={hasHoldings}
      baseCurrency="EUR"
      asOf={asOf}
      isLoading={isLoading}
      onImport={onImport}
    />
  )
}

describe('PortfolioOverview', () => {
  it('holds the curve back while the history is still being valued', () => {
    renderChart({ isLoading: true })

    expect(screen.getByTestId('chart-loading')).toBeInTheDocument()
  })

  // A portfolio a day old has no line to draw between two days that do not
  // exist yet, and an empty axis says less than nothing - but it is still worth
  // something, and that is still the page's headline.
  it('draws no curve from a single day, and still states the value', () => {
    renderChart({ points: series(1, { value: 100, invested: 100, performance: 0 }) })

    expect(screen.getByText('12,500.00')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Performance' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument()
  })

  // The value heads the page whatever the curve is drawing, and what that has
  // earned over the window in view reads underneath it.
  it('heads the page with what it is worth and what the window earned', () => {
    renderChart()

    expect(screen.getByText('12,500.00')).toBeInTheDocument()
    expect(screen.getByText('EUR')).toBeInTheDocument()
    // 10,000 in on day one, 12,500 at the end of 399 days.
    expect(screen.getByText(/%\/year/)).toHaveTextContent('+22.6%/year')
    expect(screen.getByText('(+2,500.00)')).toBeInTheDocument()
    expect(screen.getByText(/since Feb 2025/)).toBeInTheDocument()
  })

  // What the holdings returned is the question a portfolio page is opened with.
  it('draws the return first of the three', () => {
    renderChart()

    expect(screen.getByRole('button', { name: 'Performance' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('keeps the headline on the value whichever curve is drawn', async () => {
    const user = userEvent.setup()
    renderChart()

    await user.click(screen.getByRole('button', { name: 'Profit/loss' }))

    expect(screen.getByText('12,500.00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Profit/loss' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  // The one place an import starts from, now that the accounts themselves are
  // folded away at the foot of the page.
  it('starts an import', async () => {
    const user = userEvent.setup()
    const onImport = vi.fn()
    renderChart({ onImport })

    await user.click(screen.getByRole('button', { name: /Import statement/ }))

    expect(onImport).toHaveBeenCalledTimes(1)
  })

  it('offers no import while there is no account to import into', () => {
    renderChart()

    expect(screen.queryByRole('button', { name: /Import statement/ })).not.toBeInTheDocument()
  })

  it('has no figure to state before anything is held', () => {
    renderChart({ hasHoldings: false })

    expect(screen.queryByText('12,500.00')).not.toBeInTheDocument()
  })

  // A chart of the last month has to start at 0% on the first day of that
  // month, not at whatever the portfolio had already made before it began.
  it('measures a shorter window from its own first day', async () => {
    const user = userEvent.setup()
    renderChart()

    await user.click(screen.getByRole('button', { name: '1M' }))

    // A month of a 400-day climb to +25% is roughly a fortieth of it.
    expect(screen.queryByText('+25.0%')).not.toBeInTheDocument()
    expect(screen.getByText(/since Feb 2026/)).toBeInTheDocument()
  })

  // Offering a year of a portfolio opened last month draws the same curve
  // under four different names.
  it('offers only the windows the history is long enough to fill', () => {
    renderChart({ points: series(20, { value: 1050, invested: 1000, performance: 0.05 }) })

    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '1M' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '1Y' })).not.toBeInTheDocument()
  })

  it('offers every window once the history spans them', () => {
    renderChart()

    for (const label of ['1M', '6M', 'YTD', '1Y', 'All']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  // Money-weighted, not the curve's own time-weighted return annualised: the
  // second half of the money was only in the market for half the time, and the
  // yearly rate has to reflect that.
  it('states the rate the money itself earned, not the one the holdings did', () => {
    renderChart({
      points: [
        { date: dayKey(399), value: 5000, invested: 5000, gain: 0, flow: 5000, performance: 0 },
        { date: dayKey(200), value: 10500, invested: 10000, gain: 500, flow: 5000, performance: 0.1 },
        { date: dayKey(0), value: 12000, invested: 10000, gain: 2000, flow: 0, performance: 0.25 },
      ],
    })

    expect(screen.getByText(/%\/year/)).toHaveTextContent('+24.6%/year')
    // The same climb measured against the whole window would read as 22.6%.
    expect(screen.queryByText('+22.6%/year')).not.toBeInTheDocument()
  })

  it('refuses to annualise a window too short to say anything', () => {
    renderChart({ points: series(10, { value: 1050, invested: 1000, performance: 0.05 }) })

    expect(screen.queryByText(/%\/year/)).not.toBeInTheDocument()
  })

  // A curve missing a holding reads as a portfolio that is smaller, not as one
  // that is incomplete - and a holding with no symbol is one click from being
  // on it, which is worth saying differently from one the feed cannot reach.
  it('tells a holding that only needs a symbol from one the feed cannot reach', () => {
    renderChart({
      unpriced: [makeInstrument('S&P Global'), makeInstrument('Vanguard S&P 500', 'VUSA.AS')],
    })

    expect(screen.getByText(/leaves out S&P Global — no symbol chosen yet/)).toBeInTheDocument()
    expect(
      screen.getByText(/leaves out Vanguard S&P 500 — no price history reaches back/)
    ).toBeInTheDocument()
  })

  it('marks which window and which figure are being shown', async () => {
    const user = userEvent.setup()
    renderChart()

    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: '6M' }))

    expect(screen.getByRole('button', { name: '6M' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reads a portfolio that has lost money as a loss', () => {
    renderChart({ points: series(200, { value: 8000, invested: 10000, performance: -0.2 }) })

    const region = within(screen.getByRole('region', { name: 'Portfolio' }))
    expect(region.getByText(/%\/year/)).toHaveClass('text-red-600')
    expect(region.getByText('(-2,000.00)')).toHaveClass('text-red-600')
  })
})

// The curve is drawn by recharts, which needs a laid-out container jsdom does
// not provide; these cover everything around it, and the figures themselves are
// covered where they are computed, in portfolio-history.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  return { ...actual, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }
})
