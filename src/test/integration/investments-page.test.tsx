import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db-dexie'
import {
  ydoc,
  brokerAccounts as yBrokerAccounts,
  instruments as yInstruments,
  trades as yTrades,
} from '@/lib/crdts'
import { investmentService, type ImportTradeRow } from '@/services/investmentService'
import { InvestmentsPage } from '@/components/investments/InvestmentsPage'
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

vi.mock('@/lib/market-data-client', () => ({
  marketDataClient: { getCloses: mocks.getCloses },
  searchSymbols: mocks.searchSymbols,
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

  mocks.getCloses.mockImplementation(async (symbols: string[], _from: Date, to: Date) => {
    const closes = new Map<string, number>()
    const currencies = new Map<string, string>()
    for (const symbol of symbols) {
      const price = PRICES[symbol]
      if (!price) continue
      closes.set(createPriceCacheKey(symbol, utcDateKey(to)), price.close)
      currencies.set(symbol, price.currency)
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

    render(<InvestmentsPage />)

    // The account is the entry point to everything else on the page.
    expect(await screen.findByText('DEGIRO Custody')).toBeInTheDocument()

    const holding = await screen.findByRole('row', { name: /iShares Core MSCI World/ })

    // 40.53125 shares, exact - not 40.53, and not padded to eight places.
    expect(within(holding).getByText('40.53125')).toBeInTheDocument()
    // 40.53125 x 110.00
    expect(within(holding).getByText('4,458.44')).toBeInTheDocument()
    // 4,458.44 market value against 4,053.13 paid.
    expect(within(holding).getByText('+405.31')).toBeInTheDocument()
    expect(within(holding).getByText('25.00')).toBeInTheDocument()

    // The same figure again as the portfolio's own total, since this is the
    // only holding carrying a value.
    expect(screen.getAllByText('4,458.44').length).toBeGreaterThan(1)
  })

  it('says which holding is missing from the total, and why', async () => {
    await seedPortfolio()

    render(<InvestmentsPage />)

    // Held, and deliberately not counted as worthless: the shares and what they
    // cost are still on the row.
    const unresolved = await screen.findByRole('row', { name: /Vanguard S&P 500/ })
    expect(within(unresolved).getByText('10')).toBeInTheDocument()

    expect(
      await screen.findByText('Excludes Vanguard S&P 500 — no symbol chosen yet.')
    ).toBeInTheDocument()
  })

  it('opens the import drawer for the account the user picked', async () => {
    const user = userEvent.setup()
    await seedPortfolio()

    render(<InvestmentsPage />)

    // Clicked once the page has settled, the way a user reaches it: the live
    // queries are still re-rendering the list until the figures land.
    await screen.findByText('40.53125')

    await user.click(await screen.findByRole('button', { name: 'Import statement' }))

    expect(
      await screen.findByText('Add trades to DEGIRO Custody from a broker CSV.')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeInTheDocument()
  })

  it('reprices the holding once its symbol is resolved in the picker', async () => {
    const user = userEvent.setup()
    await seedPortfolio()

    render(<InvestmentsPage />)

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

    const repriced = await screen.findByRole('row', { name: /Vanguard S&P 500/ })
    // 10 x 80.20
    expect(within(repriced).getByText('802.00')).toBeInTheDocument()

    const stored = await db.instruments.where('ticker').equals('VUSA').first()
    expect(stored?.symbol).toBe('VUSA.AS')
  })
})
