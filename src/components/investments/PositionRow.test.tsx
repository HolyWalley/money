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

function renderRow(position: PortfolioPosition, onResolveSymbol = vi.fn()) {
  const result = render(
    <table>
      <tbody>
        <PositionRow position={position} onResolveSymbol={onResolveSymbol} />
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
    expect(screen.getByText('83.32')).toBeInTheDocument()
    expect(screen.getByText('100.00')).toBeInTheDocument()
    expect(screen.getByText('46,809.35')).toBeInTheDocument()
    expect(screen.getByText('210.50')).toBeInTheDocument()
    expect(screen.getByText('+8,019.85')).toBeInTheDocument()
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
          <PositionRow position={world} onResolveSymbol={vi.fn()} />
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

    const cells = screen.getAllByRole('cell')
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
    expect(cells[2]).toHaveTextContent('0.003')
    expect(cells[3]).toHaveTextContent('0.0034')
    expect(cells[4]).toHaveTextContent('34.00')
  })

  it('names a holding whose instrument record is gone rather than showing an empty row', () => {
    renderRow(makePosition({ instrumentId: 'orphan', quantity: 3, cost: 90, averageCost: 30 }))

    expect(screen.getByText('Unknown holding')).toBeInTheDocument()
    expect(screen.getByText('EUR')).toBeInTheDocument()
  })
})

describe('PositionCard', () => {
  it('carries the same figures where there are no columns', () => {
    render(<PositionCard position={world} onResolveSymbol={vi.fn()} />)

    expect(screen.getByText('iShares Core MSCI World')).toBeInTheDocument()
    expect(screen.getByText('46,809.35')).toBeInTheDocument()
    expect(screen.getByText('+7,809.35 (+20.0%)')).toBeInTheDocument()

    const quantity = screen.getByText('Quantity').closest('div') as HTMLElement
    expect(within(quantity).getByText('468.09345794')).toBeInTheDocument()
  })

  it('keeps a sold-out holding to what is left of it: the gain and the income', () => {
    render(
      <PositionCard
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
