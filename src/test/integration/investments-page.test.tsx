import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db-dexie'
import {
  ydoc,
  brokerAccounts as yBrokerAccounts,
  instruments as yInstruments,
  trades as yTrades,
} from '@/lib/crdts'
import { resetSharedLiveQueries } from '@/lib/shared-live-query'
import { investmentService, type ImportTradeRow } from '@/services/investmentService'
import { InvestmentsPage } from '@/components/investments/InvestmentsPage'
import { mountSuspended } from '@/test/suspense'
import { createPriceCacheKey, utcDateKey, type InstrumentCandidate } from '../../../shared/market-data'

/**
 * The whole Investments screen, composed the way the router mounts it, over the
 * real Yjs document and its Dexie projection.
 *
 * Five components were built against one another's contracts without ever
 * running together: the page, the broker-account list, the positions table, the
 * import drawer and the symbol picker. Everything here is the real thing except
 * the two network boundaries - the price feed and the symbol index - so what is
 * under test is the seam between them: trades stored as CRDT updates coming
 * back out as priced rows a user can read, and a symbol resolved in the picker
 * actually repricing the holding behind it.
 */

const PRICES: Record<string, { close: number; currency: string }> = {
  'IWDA.AS': { close: 110, currency: 'EUR' },
  // Two listings of the same ISIN, a whole FX rate apart - the mistake the
  // picker exists to prevent the user making.
  'VUSA.AS': { close: 80.2, currency: 'EUR' },
  'VUSA.L': { close: 96, currency: 'USD' },
}

const VUSA_CANDIDATES: InstrumentCandidate[] = [
  { symbol: 'VUSA.L', name: 'Vanguard S&P 500 UCITS ETF', currency: 'USD', exchange: 'LSE' },
  { symbol: 'VUSA.AS', name: 'Vanguard S&P 500 UCITS ETF', currency: 'EUR', exchange: 'AMS' },
]

const mocks = vi.hoisted(() => ({
  getCloses: vi.fn(),
  searchSymbols: vi.fn(),
}))

// recharts measures its container, and jsdom lays nothing out, so every chart
// on the page would otherwise render at zero and warn about it once per pass.
// The curve's own figures are covered where they are computed.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  }
})

vi.mock('@/lib/market-data-client', () => ({
  marketDataClient: { getCloses: mocks.getCloses },
  searchSymbols: mocks.searchSymbols,
}))

// The daily rates the history curve converts with. One currency throughout, so
// there is nothing to convert and nothing to fetch.
vi.mock('@/hooks/useExchangeRates', () => ({
  useExchangeRates: () => ({ rates: new Map(), isLoading: false, error: null }),
}))

// One currency throughout, so a figure on screen is the figure the engine
// computed rather than the product of a rate this test invented.
vi.mock('@/hooks/useCurrentRates', () => ({
  useCurrentRates: () => ({
    convert: (amount: number, currency: string) => (currency === 'EUR' ? amount : null),
    baseCurrency: 'EUR',
    isLoading: false,
  }),
}))

const BUY_DATE = '2025-02-11T09:30:00.000Z'

function trade(row: Partial<ImportTradeRow> & { externalId: string }): ImportTradeRow {
  return {
    kind: 'buy',
    date: BUY_DATE,
    quantity: 0,
    amount: 0,
    currency: 'EUR',
    fee: 0,
    ...row,
  }
}

async function seedPortfolio() {
  const account = await investmentService.createBrokerAccount({
    name: 'DEGIRO Custody',
    broker: 'degiro',
  })

  const world = await investmentService.findOrCreateInstrument({
    name: 'iShares Core MSCI World',
    isin: 'IE00B4L5Y983',
    ticker: 'IWDA',
    symbol: 'IWDA.AS',
    currency: 'EUR',
    kind: 'etf',
  })

  // Imported but never resolved to a price feed, which is the state every
  // holding starts in straight after an import.
  const sp500 = await investmentService.findOrCreateInstrument({
    name: 'Vanguard S&P 500',
    isin: 'IE00B3XXRP09',
    ticker: 'VUSA',
    currency: 'EUR',
    kind: 'etf',
  })

  const summary = await investmentService.importTrades(account._id, [
    trade({ externalId: 'w-1', instrumentId: world._id, quantity: 30, price: 100, amount: -3000 }),
    // A fractional fill, so the quantity on screen proves it did not go through
    // a money formatter on the way.
    trade({
      externalId: 'w-2',
      instrumentId: world._id,
      quantity: 10.53125,
      price: 100,
      amount: -1053.13,
    }),
    trade({
      externalId: 'w-3',
      instrumentId: world._id,
      kind: 'dividend',
      amount: 25,
      date: '2025-06-02T09:00:00.000Z',
    }),
    trade({ externalId: 's-1', instrumentId: sp500._id, quantity: 10, price: 80, amount: -800 }),
  ])
  expect(summary.invalid).toEqual([])
  expect(summary.inserted).toBe(4)

  // The components read the Dexie projection, not the document the service
  // wrote to, so nothing is on screen until the observers have caught up.
  await waitFor(async () => {
    expect(await db.trades.where('accountId').equals(account._id).count()).toBe(4)
    expect(await db.instruments.count()).toBe(2)
    expect(await db.brokerAccounts.count()).toBe(1)
  })

  return { account, world, sp500 }
}

beforeEach(async () => {
  vi.clearAllMocks()
  resetSharedLiveQueries()

  // Every day of the range, not only its last: the history curve values what
  // was held on each day in turn, and a feed answering for one day would leave
  // it reporting the past as unpriced.
  mocks.getCloses.mockImplementation(async (symbols: string[], from: Date, to: Date) => {
    const closes = new Map<string, number>()
    const currencies = new Map<string, string>()
    for (const symbol of symbols) {
      const price = PRICES[symbol]
      if (!price) continue
      currencies.set(symbol, price.currency)
      for (let day = new Date(from); day <= to; day.setUTCDate(day.getUTCDate() + 1)) {
        closes.set(createPriceCacheKey(symbol, utcDateKey(day)), price.close)
      }
    }
    return { closes, currencies }
  })
  mocks.searchSymbols.mockResolvedValue(VUSA_CANDIDATES)

  ydoc.transact(() => {
    for (const id of [...yTrades.keys()]) yTrades.delete(id)
    for (const id of [...yInstruments.keys()]) yInstruments.delete(id)
    for (const id of [...yBrokerAccounts.keys()]) yBrokerAccounts.delete(id)
  })
  await db.trades.clear()
  await db.instruments.clear()
  await db.brokerAccounts.clear()

  window.innerWidth = 1024
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: window.innerWidth < 768,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
})

describe('the investments page, end to end', () => {
  it('values stored trades as real positions a user can read', async () => {
    await seedPortfolio()

    await mountSuspended(<InvestmentsPage />)

    // The holdings are what the page is for; the account behind them is folded
    // away until someone goes looking for it.
    expect(await screen.findByRole('button', { name: /Broker accounts/ })).toHaveTextContent('(1)')
    expect(screen.queryByRole('button', { name: 'Open DEGIRO Custody menu' })).not.toBeInTheDocument()

    await screen.findAllByRole('row', { name: /iShares Core MSCI World/ })
    const holdings = within(screen.getByRole('table', { name: 'Open holdings' }))
    const holding = holdings.getByRole('row', { name: /iShares Core MSCI World/ })

    // 40.53125 shares, exact - not 40.53, and not padded to eight places.
    expect(within(holding).getByText('40.53125')).toBeInTheDocument()
    // 40.53125 x 110.00
    expect(within(holding).getByText('4,458.44')).toBeInTheDocument()
    // 4,458.44 market value against 4,053.13 paid, plus the 25.00 dividend the
    // return is made of and says so.
    expect(within(holding).getByText('+430.31')).toBeInTheDocument()
    expect(within(holding).getByText(/incl\. 25\.00 in dividends/)).toBeInTheDocument()

    // The same figure again as the portfolio's own total, since this is the
    // only holding carrying a value.
    expect(screen.getAllByText('4,458.44').length).toBeGreaterThan(1)
  })

  // The curve is derived from the stored trades and the daily closes, so it
  // exists for every day since the first buy without anything being snapshotted.
  it('draws the value of what was held on every day since the first trade', async () => {
    await seedPortfolio()

    await mountSuspended(<InvestmentsPage />)

    await screen.findByText('40.53125')

    // The block is on the page from the first render; the curve and its windows
    // arrive with the closes, so the wait is for one of those.
    await screen.findByRole('button', { name: 'Performance' })
    const chart = within(screen.getByRole('region', { name: 'Portfolio' }))

    // Every window the history is long enough to fill, and the whole of it.
    expect(chart.getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(chart.getByRole('button', { name: '1Y' })).toBeInTheDocument()

    // The holding with no symbol cannot be valued on any day, and the curve
    // says so rather than reading as a smaller portfolio.
    expect(
      chart.getByText(/The curve leaves out Vanguard S&P 500 — no symbol chosen yet/)
    ).toBeInTheDocument()
  })

  // The dividend was stored as an ordinary trade row; nothing else records it.
  it('counts the stored dividend in the year it was paid', async () => {
    await seedPortfolio()

    await mountSuspended(<InvestmentsPage />)

    await screen.findByText('40.53125')

    const dividends = within(await screen.findByRole('region', { name: 'Dividends' }))
    expect(dividends.getByText(/25.00 EUR in total/)).toBeInTheDocument()
    expect(dividends.getByRole('button', { name: '2025' })).toBeInTheDocument()
  })

  it('says which holding is missing from the total, and why', async () => {
    await seedPortfolio()

    await mountSuspended(<InvestmentsPage />)

    // Held, and deliberately not counted as worthless: the shares and what they
    // cost are still on the row.
    // Both tables name the holding now, so the row is waited for first and then
    // taken from the one that values it.
    await screen.findAllByRole('row', { name: /Vanguard S&P 500/ })
    const holdings = within(screen.getByRole('table', { name: 'Open holdings' }))
    const unresolved = holdings.getByRole('row', { name: /Vanguard S&P 500/ })
    expect(within(unresolved).getByText('10')).toBeInTheDocument()

    // Re-queried on each attempt rather than captured once: the page renders
    // again as the ledger below it fills, and a node held from before that is
    // detached by the time it is asserted on.
    await waitFor(() =>
      expect(screen.getAllByText(/Excludes Vanguard S&P 500 — no symbol chosen yet/).length)
        .toBeGreaterThan(0)
    )
  })

  // Before the first account there is nothing to value and nowhere to import
  // to, so the page asks for the one thing it needs.
  it('asks for an account before it offers anything else', async () => {
    await mountSuspended(<InvestmentsPage />)

    // The page suspends until the accounts are known, so the empty state is
    // there the moment anything is, never a portfolio that blanks into it.
    await waitFor(() => expect(screen.queryByTestId('fallback')).not.toBeInTheDocument())
    expect(screen.getByText('No broker accounts yet')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Portfolio' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Import statement' })).not.toBeInTheDocument()
  })

  it('opens the import drawer from the portfolio itself', async () => {
    const user = userEvent.setup()
    await seedPortfolio()

    await mountSuspended(<InvestmentsPage />)

    // Clicked once the page has settled, the way a user reaches it: the live
    // queries are still re-rendering the list until the figures land.
    await screen.findByText('40.53125')

    await user.click(await screen.findByRole('button', { name: 'Import statement' }))

    // No account named yet: the file itself says which broker it is from, and
    // the drawer works the account out from that.
    expect(
      await screen.findByText('Add trades from a broker CSV, into the account it belongs to.')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeInTheDocument()
  })

  it('still imports into one named account when started from that account', async () => {
    const user = userEvent.setup()
    await seedPortfolio()

    await mountSuspended(<InvestmentsPage />)

    await screen.findByText('40.53125')

    await user.click(await screen.findByRole('button', { name: /Broker accounts/ }))
    await user.click(await screen.findByRole('button', { name: 'Open DEGIRO Custody menu' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Import statement' }))

    expect(
      await screen.findByText('Add trades to DEGIRO Custody from a broker CSV.')
    ).toBeInTheDocument()
  })

  it('reprices the holding once its symbol is resolved in the picker', async () => {
    const user = userEvent.setup()
    await seedPortfolio()

    await mountSuspended(<InvestmentsPage />)

    await screen.findByText('40.53125')

    await user.click(await screen.findByRole('button', { name: 'Choose symbol' }))
    // The evidence the ranking rests on: the price that buy actually went
    // through at, on the day it went through - carried all the way from the
    // stored trade, not an average cost stamped with today's date.
    expect(
      await screen.findByText(/You paid/)
    ).toHaveTextContent('You paid 80.00 EUR per share on Feb 11, 2025')

    // The Amsterdam line closed at 80.20 against the 80.00 paid; the London one
    // at 96.00 is the same ISIN a whole FX rate away.
    const recommended = await screen.findByRole('button', {
      name: /VUSA\.AS Matches what you paid/,
    })
    expect(recommended).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /VUSA\.L/ })).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByRole('button', { name: 'Use VUSA.AS' }))

    // Saved through the CRDT, back out through the Dexie projection, and the
    // holding that was excluded a moment ago now carries a value.
    await waitFor(() => {
      expect(screen.queryByText('Excludes Vanguard S&P 500 — no symbol chosen yet.')).not.toBeInTheDocument()
    })

    // Re-queried on each attempt: the page renders again as the ledger and the
    // curve below it take the new symbol, and a row held from before that is
    // detached by the time it is read.
    // 10 x 80.20
    await waitFor(() => {
      const repriced = within(screen.getByRole('table', { name: 'Open holdings' })).getByRole('row', {
        name: /Vanguard S&P 500/,
      })
      expect(within(repriced).getByText('802.00')).toBeInTheDocument()
    })

    const stored = await db.instruments.where('ticker').equals('VUSA').first()
    expect(stored?.symbol).toBe('VUSA.AS')
  })
})
