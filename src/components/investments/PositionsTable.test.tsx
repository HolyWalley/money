import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PositionsTable } from './PositionsTable'
import { investmentService } from '@/services/investmentService'
import type { PortfolioPosition } from '@/hooks/usePortfolio'
import type { PortfolioSummary } from '@/lib/positions'
import type { Instrument } from '../../../shared/schemas/instrument.schema'
import type { SymbolPickerProps } from './SymbolPicker'

vi.mock('@/services/investmentService', () => ({
  investmentService: { updateInstrument: vi.fn().mockResolvedValue(undefined) },
}))

const mocks = vi.hoisted(() => ({
  trades: [] as Array<{ instrumentId?: string; kind: string; price?: number; date: string }>,
}))

// The table reads the trades only to hand the picker a real executed price.
vi.mock('@/hooks/useLiveTrades', () => ({
  useLiveTrades: () => mocks.trades,
}))

// The picker is another component's job; this stub is only here to prove the
// table opens it for the right instrument, hands it the right evidence, and
// leaves the saving to it.
vi.mock('./SymbolPicker', () => ({
  SymbolPicker: ({ instrument, open, onResolve, reference }: SymbolPickerProps) =>
    open ? (
      <div>
        <span>Picking a symbol for {instrument.name}</span>
        <span data-testid="picker-reference">
          {reference ? `${reference.price} on ${reference.date}` : 'nothing to rank by'}
        </span>
        <button onClick={() => onResolve('CSPX.AS')}>Use CSPX.AS</button>
      </div>
    ) : null,
}))

const asOf = new Date('2025-09-05T10:00:00.000Z')

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

/** An ordinary priced holding, with every derived figure following from the close. */
function priced(
  instrumentId: string,
  name: string,
  quantity: number,
  cost: number,
  close: number,
  extras: Partial<PortfolioPosition> = {}
): PortfolioPosition {
  const marketValue = quantity * close
  const unrealised = marketValue - cost
  const realised = extras.realised ?? 0
  const dividends = extras.dividends ?? 0

  return makePosition({
    instrumentId,
    instrument: makeInstrument({ _id: instrumentId, name, ticker: name.slice(0, 4).toUpperCase() }),
    symbol: `${instrumentId.toUpperCase()}.AS`,
    quoteCurrency: 'EUR',
    quantity,
    cost,
    averageCost: cost / quantity,
    close,
    marketValue,
    unrealised,
    totalReturn: unrealised + realised + dividends,
    marketValueInBase: marketValue,
    ...extras,
  })
}

function makeSummary(overrides: Partial<PortfolioSummary> = {}): PortfolioSummary {
  return {
    cost: 0,
    marketValue: 0,
    unrealised: 0,
    realised: 0,
    dividends: 0,
    totalReturn: 0,
    missingPrices: [],
    missingCurrencies: [],
    unquantified: [],
    ...overrides,
  }
}

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
}

interface RenderOptions {
  positions?: PortfolioPosition[]
  summary?: Partial<PortfolioSummary>
  needsSymbol?: Instrument[]
  baseCurrency?: string
}

function renderTable({
  positions = [],
  summary = {},
  needsSymbol = [],
  baseCurrency = 'EUR',
}: RenderOptions = {}) {
  return render(
    <PositionsTable
      positions={positions}
      summary={makeSummary(summary)}
      needsSymbol={needsSymbol}
      baseCurrency={baseCurrency}
      asOf={asOf}
    />
  )
}

const apple = priced('apple', 'Apple', 32, 4000, 187.5, { dividends: 45.2 })
const world = priced('world', 'iShares Core MSCI World', 468.09345794, 39000, 92.55)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.trades = []
  setViewport(1024)
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: window.innerWidth < 768,
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

describe('PositionsTable', () => {
  it('invites an import when nothing has been imported yet', () => {
    renderTable()

    expect(screen.getByText('No holdings yet')).toBeInTheDocument()
    expect(screen.getByText(/Import a statement from one of your broker accounts/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows each open holding with its gain', () => {
    renderTable({
      positions: [apple],
      summary: {
        cost: 4000,
        marketValue: 6000,
        unrealised: 2000,
        realised: 812.4,
        dividends: 165.2,
        totalReturn: 2977.6,
      },
    })

    // Paired down each column: what went in over what a share cost, what it is
    // worth over what a share closed at, the return over what it works out to.
    const row = screen.getByText('Apple').closest('tr')
    expect(row).toHaveTextContent('4,000.00')
    expect(row).toHaveTextContent('125.00')
    expect(row).toHaveTextContent('6,000.00')
    expect(row).toHaveTextContent('187.50')
    expect(row).toHaveTextContent('+2,045.20')
    expect(row).toHaveTextContent('+51.1%')
    expect(row).toHaveTextContent('45.20 in dividends')
    // The only holding there is, so it is the whole portfolio.
    expect(row).toHaveTextContent('100.0%')

  })

  // The footer sat under the open holdings and summed something else: every
  // figure in it was converted into the base currency the rows are not stated
  // in, and its return carried the realised gains and dividends of closed
  // holdings that are not in the table at all. The portfolio states itself
  // above the chart now, once.
  it('leaves the totals to the block that states the whole portfolio', () => {
    renderTable({
      positions: [apple],
      summary: { cost: 4000, marketValue: 6000, unrealised: 2000, totalReturn: 2977.6 },
    })

    expect(screen.queryByTestId('portfolio-totals')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Total/)).not.toBeInTheDocument()
  })

  it('states quantities exactly, without money rounding or padding', () => {
    renderTable({ positions: [world, apple] })

    expect(screen.getByText('468.09345794')).toBeInTheDocument()
    expect(screen.getByText('32')).toBeInTheDocument()
    expect(screen.queryByText('32.00')).not.toBeInTheDocument()
    expect(screen.queryByText('468.09')).not.toBeInTheDocument()
  })

  it('keeps a sold-out position out of the holdings but not out of the record', async () => {
    const user = userEvent.setup()
    const sold = makePosition({
      instrumentId: 'vusa',
      instrument: makeInstrument({ _id: 'vusa', name: 'Vanguard S&P 500' }),
      symbol: 'VUSA.AS',
      isClosed: true,
      realised: 812.4,
      dividends: 120,
      close: null,
      marketValue: 0,
      unrealised: 0,
      totalReturn: 932.4,
      marketValueInBase: 0,
      status: 'closed',
    })

    renderTable({ positions: [apple, sold] })

    expect(screen.queryByText('Vanguard S&P 500')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Closed holdings/ }))

    expect(screen.getByText('Vanguard S&P 500')).toBeInTheDocument()
    const row = screen.getByText('Vanguard S&P 500').closest('tr')
    expect(row).toHaveTextContent('+812.40')
    expect(row).toHaveTextContent('120.00')
    expect(row).toHaveTextContent('+932.40')
  })

  it('says the valuation is partial when a close is missing', () => {
    const unpriced = makePosition({
      instrumentId: 'emim',
      instrument: makeInstrument({ _id: 'emim', name: 'iShares EM IMI' }),
      symbol: 'EMIM.AS',
      quantity: 120,
      cost: 3600,
      averageCost: 30,
    })

    renderTable({
      positions: [apple, unpriced],
      summary: { cost: 4000, marketValue: 6000, unrealised: 2000, missingPrices: ['emim'] },
    })

    expect(
      screen.getByText('Excludes iShares EM IMI — no recent close available.')
    ).toBeInTheDocument()
    expect(screen.getByText('No close')).toBeInTheDocument()

    // Its cost is still on the row, so an unvalued holding does not read as an
    // empty one.
    const row = screen.getByText('iShares EM IMI').closest('tr')
    expect(row).toHaveTextContent('120')
    expect(row).toHaveTextContent('30.00')
  })

  it('says which currencies the totals could not reach', () => {
    const polish = priced('pkoak', 'PKO Bank Polski', 200, 10000, 62.4, { currency: 'PLN' })

    renderTable({
      positions: [apple, polish],
      summary: { cost: 4000, marketValue: 6000, unrealised: 2000, missingCurrencies: ['PLN'] },
    })

    expect(screen.getByText('Excludes PLN — no exchange rate available.')).toBeInTheDocument()
  })

  it('says plainly that a holding cost money for shares nothing counted', () => {
    const unquantified = makePosition({
      instrumentId: 'ghost',
      instrument: makeInstrument({ _id: 'ghost', name: 'Xtrackers MSCI Japan' }),
      symbol: 'XMJP.DE',
      cost: 1234,
      isClosed: true,
      unquantified: true,
      status: 'unquantified',
    })

    renderTable({ positions: [apple, unquantified], summary: { unquantified: ['ghost'] } })

    expect(
      screen.getByText('Excludes Xtrackers MSCI Japan — the statement never counted the shares.')
    ).toBeInTheDocument()

    const row = screen.getByText('Xtrackers MSCI Japan').closest('tr')
    expect(row).toHaveTextContent('Unknown')
    expect(row).toHaveTextContent('1,234.00 EUR paid for shares the statement never counted')

    // Market value, not a confident zero: nothing counted the shares, so the
    // holding is unvalued rather than worthless.
    const cells = within(row as HTMLElement).getAllByRole('cell')
    expect(cells[4]).toHaveTextContent('—')
  })

  it('flags a history that starts mid-story and rows the position could not absorb', () => {
    const messy = priced('messy', 'Messy Holding', 10, 500, 60, {
      oversold: true,
      excluded: [
        {
          trade: {
            instrumentId: 'messy',
            kind: 'buy',
            date: 'not a date',
            quantity: 2,
            amount: 100,
            currency: 'EUR',
          },
          reason: 'unreadable-date',
        },
        {
          trade: {
            instrumentId: 'messy',
            kind: 'buy',
            date: '2024-05-01T00:00:00.000Z',
            quantity: 1,
            amount: 60,
            currency: 'USD',
          },
          reason: 'foreign-currency',
        },
      ],
    })

    renderTable({ positions: [messy] })

    expect(
      screen.getByText('A sale took more than the history shows was ever bought')
    ).toBeInTheDocument()
    expect(
      screen.getByText('2 rows left out: an unreadable date and another currency')
    ).toBeInTheDocument()
  })

  it('offers to resolve an instrument that has no symbol, and leaves the saving to the picker', async () => {
    const user = userEvent.setup()
    const instrument = makeInstrument({ _id: 'cspx', name: 'iShares Core S&P 500' })
    const unresolved = makePosition({
      instrumentId: 'cspx',
      instrument,
      quantity: 5,
      cost: 2000,
      averageCost: 400,
      status: 'needs-symbol',
    })

    renderTable({
      positions: [unresolved],
      needsSymbol: [instrument],
      summary: { missingPrices: ['cspx'] },
    })

    expect(
      screen.getByText('Excludes iShares Core S&P 500 — no symbol chosen yet.')
    ).toBeInTheDocument()
    // Named once, as the gap the user can close - not again as a missing close.
    expect(screen.queryByText(/no recent close available/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Choose symbol' }))
    expect(screen.getByText('Picking a symbol for iShares Core S&P 500')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Use CSPX.AS' }))

    await waitFor(() => {
      expect(screen.queryByText('Picking a symbol for iShares Core S&P 500')).not.toBeInTheDocument()
    })
    // The picker writes the symbol itself and reports its own failures. A
    // second write here would put the same value through the CRDT twice.
    expect(investmentService.updateInstrument).not.toHaveBeenCalled()
  })

  it('offers the picker the price a buy actually went through at, on that day', async () => {
    const user = userEvent.setup()
    const instrument = makeInstrument({ _id: 'cspx', name: 'iShares Core S&P 500' })

    // Bought twice at prices a long way apart, so an average cost (417.50)
    // could not be mistaken for either fill.
    mocks.trades = [
      { instrumentId: 'cspx', kind: 'buy', price: 480, date: '2025-08-01T09:30:00.000Z' },
      { instrumentId: 'cspx', kind: 'buy', price: 355, date: '2025-02-11T09:30:00.000Z' },
    ]

    renderTable({
      positions: [
        makePosition({
          instrumentId: 'cspx',
          instrument,
          quantity: 5,
          cost: 2087.5,
          averageCost: 417.5,
          status: 'needs-symbol',
        }),
      ],
      needsSymbol: [instrument],
    })

    await user.click(screen.getByRole('button', { name: 'Choose symbol' }))

    // The most recent buy, with its own date - not the average cost, and not
    // the day the portfolio happens to be valued on.
    expect(screen.getByTestId('picker-reference')).toHaveTextContent(
      '480 on 2025-08-01T09:30:00.000Z'
    )
  })

  it('lays the holdings out as cards on a phone', () => {
    setViewport(375)

    renderTable({
      positions: [apple],
      summary: { cost: 4000, marketValue: 6000, unrealised: 2000, totalReturn: 2045.2 },
    })

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('Apple')).toBeInTheDocument()
    expect(screen.getByText('Quantity')).toBeInTheDocument()
    expect(screen.getByText('32')).toBeInTheDocument()
    expect(screen.getByText('+2,045.20 (+51.1%)')).toBeInTheDocument()
    expect(screen.queryByTestId('portfolio-totals')).not.toBeInTheDocument()
  })
})
