import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import {
  PositionCard,
  PositionRow,
  formatPercent,
  formatQuantity,
  gainClass,
  returnPercent,
} from './PositionRow'
import type { PortfolioPosition } from '@/hooks/usePortfolio'
import type { Instrument } from '../../../shared/schemas/instrument.schema'

function makeInstrument(overrides: Partial<Instrument> & { _id: string; name: string }): Instrument {
  return {
    type: 'instrument',
    currency: 'EUR',
    kind: 'etf',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makePosition(
  overrides: Partial<PortfolioPosition> & { instrumentId: string }
): PortfolioPosition {
  const base: PortfolioPosition = {
    instrumentId: overrides.instrumentId,
    quantity: 0,
    cost: 0,
    averageCost: 0,
    realised: 0,
    dividends: 0,
    fees: 0,
    currency: 'EUR',
    isClosed: false,
    oversold: false,
    unquantified: false,
    excluded: [],
    close: null,
    marketValue: null,
    unrealised: null,
    totalReturn: null,
    marketValueInBase: null,
    status: 'priced',
  }

  return { ...base, ...overrides }
}

const world = makePosition({
  instrumentId: 'world',
  instrument: makeInstrument({ _id: 'world', name: 'iShares Core MSCI World', ticker: 'IWDA' }),
  symbol: 'IWDA.AS',
  quantity: 468.09345794,
  cost: 39000,
  averageCost: 39000 / 468.09345794,
  dividends: 210.5,
  close: 100,
  marketValue: 46809.345794,
  unrealised: 7809.345794,
  totalReturn: 8019.845794,
  marketValueInBase: 46809.345794,
})

/** 100,000 as the whole portfolio, so a holding's share reads straight off its value. */
const PORTFOLIO_VALUE = 100000

function renderRow(position: PortfolioPosition, portfolioValue = PORTFOLIO_VALUE) {
  const onResolveSymbol = vi.fn()
  const result = render(
    <table>
      <tbody>
        <PositionRow
          position={position}
          onResolveSymbol={onResolveSymbol}
          portfolioValue={portfolioValue}
        />
      </tbody>
    </table>
  )
  return { ...result, onResolveSymbol }
}

describe('formatQuantity', () => {
  it('keeps a fractional holding exact and leaves a whole one whole', () => {
    expect(formatQuantity(468.09345794)).toBe('468.09345794')
    expect(formatQuantity(0.03009419)).toBe('0.03009419')
    expect(formatQuantity(32)).toBe('32')
    expect(formatQuantity(1500.5)).toBe('1,500.5')
  })
})

describe('returnPercent', () => {
  it('measures a gain against what it took to earn it', () => {
    expect(returnPercent(250, 1000)).toBe(25)
    expect(formatPercent(returnPercent(250, 1000) as number)).toBe('+25.0%')
    expect(formatPercent(-12.34)).toBe('-12.3%')
  })

  it('states no percentage where there is no basis to state one against', () => {
    expect(returnPercent(250, 0)).toBeNull()
    expect(returnPercent(null, 1000)).toBeNull()
  })
})

describe('gainClass', () => {
  it('reads up as good and down as bad, and says nothing when nothing moved', () => {
    expect(gainClass(12)).toBe('text-green-600')
    expect(gainClass(-12)).toBe('text-red-600')
    expect(gainClass(0)).toBe('text-muted-foreground')
    expect(gainClass(null)).toBe('text-muted-foreground')
  })
})

describe('PositionRow', () => {
  it('lets a holding that already has a symbol be pointed at a different listing', async () => {
    // Searching an ISIN returns some listing, not necessarily the one bought -
    // a London USD line where the holding is the Xetra EUR one - so a symbol
    // that is already set still has to be correctable, or a wrong pick
    // misprices the holding for good.
    const user = userEvent.setup()
    const { onResolveSymbol } = renderRow(world)

    await user.click(screen.getByRole('button', { name: 'IWDA.AS' }))

    expect(onResolveSymbol).toHaveBeenCalledWith(world.instrument)
  })

  it('states the holding, its quantity and every figure that follows from it', () => {
    renderRow(world)

    expect(screen.getByText('iShares Core MSCI World')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'IWDA.AS' })).toBeInTheDocument()
    expect(screen.getByText(/· EUR/)).toBeInTheDocument()
    expect(screen.getByText('468.09345794')).toBeInTheDocument()
    // Each money column states its total over the per-share figure it comes from.
    expect(screen.getByText('39,000.00')).toBeInTheDocument()
    expect(screen.getByText('83.32')).toBeInTheDocument()
    expect(screen.getByText('46,809.35')).toBeInTheDocument()
    expect(screen.getByText('100.00')).toBeInTheDocument()
    expect(screen.getByText('+8,019.85')).toBeInTheDocument()
    expect(screen.getByText('+20.6%')).toBeInTheDocument()
  })

  // The return is not only the price moving, and a row that says so without
  // saying what else went into it reads as a price that moved further.
  it('says what the return is made of where it is made of more than price', () => {
    renderRow(world)

    expect(screen.getByText(/incl\. 210\.50 in dividends/)).toBeInTheDocument()
  })

  it('leaves the breakdown off a holding that has only ever moved in price', () => {
    renderRow(makePosition({ ...world, dividends: 0, totalReturn: 7809.345794 }))

    expect(screen.queryByText(/incl\./)).not.toBeInTheDocument()
  })

  it('measures the holding against the whole portfolio, in words and drawn', () => {
    const { container } = renderRow(world)

    expect(screen.getByText('46.8%')).toBeInTheDocument()
    const fill = container.querySelector('[data-testid="allocation-bar"] > div') as HTMLElement
    expect(parseFloat(fill.style.width)).toBeCloseTo(46.81, 2)
  })

  // Nothing is held any more, so there is no share of the portfolio to state -
  // and 0.0% would read as a holding that has shrunk to nothing.
  it('states no allocation for a holding that has been sold out of', () => {
    renderRow(
      makePosition({
        ...world,
        isClosed: true,
        quantity: 0,
        cost: 0,
        marketValue: 0,
        marketValueInBase: 0,
        status: 'closed',
      })
    )

    const cells = screen.getAllByRole('cell')
    expect(cells[5]).toHaveTextContent('—')
    expect(screen.queryByTestId('allocation-bar')).not.toBeInTheDocument()
  })

  it('colours a loss red and a gain green', () => {
    const losing = makePosition({
      ...world,
      close: 70,
      marketValue: 32766.542,
      unrealised: -6233.458,
      totalReturn: -6022.958,
    })

    const { rerender } = renderRow(losing)
    expect(screen.getByText('-6,022.96')).toHaveClass('text-red-600')

    rerender(
      <table>
        <tbody>
          <PositionRow
            position={world}
            onResolveSymbol={vi.fn()}
            portfolioValue={PORTFOLIO_VALUE}
          />
        </tbody>
      </table>
    )
    expect(screen.getByText('+8,019.85')).toHaveClass('text-green-600')
  })

  it('offers the symbol search instead of a blank price', async () => {
    const user = userEvent.setup()
    const instrument = makeInstrument({ _id: 'cspx', name: 'iShares Core S&P 500' })
    const { onResolveSymbol } = renderRow(
      makePosition({
        instrumentId: 'cspx',
        instrument,
        quantity: 5,
        cost: 2000,
        averageCost: 400,
        status: 'needs-symbol',
      })
    )

    await user.click(screen.getByRole('button', { name: 'Choose symbol' }))

    expect(onResolveSymbol).toHaveBeenCalledWith(instrument)
  })

  it('says a holding has no price rather than showing it as free', () => {
    renderRow(
      makePosition({
        instrumentId: 'emim',
        instrument: makeInstrument({ _id: 'emim', name: 'iShares EM IMI' }),
        symbol: 'EMIM.AS',
        quantity: 120,
        cost: 3600,
        averageCost: 30,
        status: 'unpriced',
      })
    )

    expect(screen.getByText('No close')).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument()
    expect(screen.getByText('30.00')).toBeInTheDocument()

    // What it cost is known; what it is worth, what it returned and what share
    // of the portfolio it is are all unknowable without a close.
    const cells = screen.getAllByRole('cell')
    expect(within(cells[2]).getByText('3,600.00')).toBeInTheDocument()
    expect(within(cells[3]).getByText('—')).toBeInTheDocument()
    expect(cells[4]).toHaveTextContent('—')
    expect(cells[5]).toHaveTextContent('—')
  })

  // The picker beside this table already shows a sub-unit close to six places;
  // rounding it to 0.00 here made one price read two ways in one feature.
  it('shows a price quoted under a unit rather than rounding it away to nothing', () => {
    renderRow(
      makePosition({
        instrumentId: 'penny',
        instrument: makeInstrument({ _id: 'penny', name: 'Sub-unit holding' }),
        symbol: 'PENNY.AS',
        quantity: 10000,
        cost: 30,
        averageCost: 0.003,
        close: 0.0034,
        marketValue: 34,
        unrealised: 4,
        totalReturn: 4,
        status: 'priced',
      })
    )

    const cells = screen.getAllByRole('cell')
    expect(within(cells[2]).getByText('0.003')).toBeInTheDocument()
    expect(within(cells[3]).getByText('0.0034')).toBeInTheDocument()
    expect(within(cells[3]).getByText('34.00')).toBeInTheDocument()
  })

  it('names a holding whose instrument record is gone rather than showing an empty row', () => {
    renderRow(makePosition({ instrumentId: 'orphan', quantity: 3, cost: 90, averageCost: 30 }))

    expect(screen.getByText('Unknown holding')).toBeInTheDocument()
    expect(screen.getByText('EUR')).toBeInTheDocument()
  })
})

describe('PositionCard', () => {
  it('carries the same figures where there are no columns', () => {
    render(
      <PositionCard
        position={world}
        onResolveSymbol={vi.fn()}
        portfolioValue={PORTFOLIO_VALUE}
      />
    )

    expect(screen.getByText('iShares Core MSCI World')).toBeInTheDocument()
    expect(screen.getByText('46,809.35')).toBeInTheDocument()
    expect(screen.getByText('+8,019.85 (+20.6%)')).toBeInTheDocument()
    expect(screen.getByText('46.8% of the portfolio')).toBeInTheDocument()

    const quantity = screen.getByText('Quantity').closest('div') as HTMLElement
    expect(within(quantity).getByText('468.09345794')).toBeInTheDocument()
    const invested = screen.getByText('Invested').closest('div') as HTMLElement
    expect(within(invested).getByText('39,000.00')).toBeInTheDocument()
  })

  it('keeps a sold-out holding to what is left of it: the gain and the income', () => {
    render(
      <PositionCard
        portfolioValue={PORTFOLIO_VALUE}
        position={makePosition({
          instrumentId: 'vusa',
          instrument: makeInstrument({ _id: 'vusa', name: 'Vanguard S&P 500' }),
          symbol: 'VUSA.AS',
          isClosed: true,
          realised: 812.4,
          dividends: 120,
          marketValue: 0,
          unrealised: 0,
          totalReturn: 932.4,
          marketValueInBase: 0,
          status: 'closed',
        })}
        onResolveSymbol={vi.fn()}
      />
    )

    expect(screen.getByText('+812.40')).toBeInTheDocument()
    expect(screen.getByText('120.00')).toBeInTheDocument()
    expect(screen.getByText('+932.40')).toBeInTheDocument()

    const quantity = screen.getByText('Quantity').closest('div') as HTMLElement
    expect(within(quantity).getByText('—')).toBeInTheDocument()
  })
})
