import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TransactionsCard } from './TransactionsCard'
import type { DailyConverter } from '@/lib/portfolio-history'
import type { BrokerAccount } from '../../../shared/schemas/broker-account.schema'
import type { Instrument } from '../../../shared/schemas/instrument.schema'
import type { Trade } from '../../../shared/schemas/trade.schema'

const mocks = vi.hoisted(() => ({
  trades: [] as Trade[],
  instruments: [] as Instrument[],
  accounts: [] as BrokerAccount[],
}))

vi.mock('@/hooks/useLiveTrades', () => ({
  useLiveTrades: () => ({ trades: mocks.trades, isLoading: false }),
}))

vi.mock('@/hooks/useLiveInstruments', () => ({
  useLiveInstruments: () => ({ instruments: mocks.instruments, isLoading: false }),
}))

vi.mock('@/hooks/useLiveBrokerAccounts', () => ({
  useLiveBrokerAccounts: () => ({ brokerAccounts: mocks.accounts, isLoading: false }),
}))

const ACCOUNT: BrokerAccount = {
  _id: 'acc-1',
  type: 'brokerAccount',
  name: 'Degiro',
  broker: 'degiro',
  order: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

const WORLD: Instrument = {
  _id: 'world',
  type: 'instrument',
  name: 'Invesco FTSE All-World UCITS ETF',
  currency: 'EUR',
  kind: 'etf',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

function trade(overrides: Partial<Trade> & { _id: string }): Trade {
  return {
    type: 'trade',
    accountId: ACCOUNT._id,
    kind: 'buy',
    date: '2026-07-27T15:43:00.000Z',
    quantity: 0,
    amount: 0,
    currency: 'EUR',
    fee: 0,
    externalId: overrides._id,
    createdAt: '2026-07-27T15:43:00.000Z',
    updatedAt: '2026-07-27T15:43:00.000Z',
    ...overrides,
  }
}

/** Euros into zloty at a flat four-and-a-third, so a figure is traceable. */
const inZloty: DailyConverter = (amount, currency) =>
  currency === 'EUR' ? amount * 4.32 : currency === 'PLN' ? amount : null

function renderCard(convertOn: DailyConverter = inZloty) {
  return render(<TransactionsCard convertOn={convertOn} baseCurrency="PLN" />)
}

beforeEach(() => {
  mocks.trades = []
  mocks.instruments = [WORLD]
  mocks.accounts = [ACCOUNT]

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
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

describe('TransactionsCard', () => {
  // Nothing has been imported, and an empty ledger says less than no ledger.
  it('says nothing at all before anything is imported', () => {
    const { container } = renderCard()

    expect(container).toBeEmptyDOMElement()
  })

  it('states each row with its kind, what it was, and what it moved', () => {
    mocks.trades = [
      trade({
        _id: 't-buy',
        instrumentId: WORLD._id,
        quantity: 209,
        price: 8.11,
        amount: -1694.99,
      }),
    ]

    renderCard()

    const row = screen.getByRole('row', { name: /Invesco/ })
    expect(within(row).getByText('Buy')).toBeInTheDocument()
    expect(within(row).getByText('Jul 27, 2026')).toBeInTheDocument()
    expect(within(row).getByText('3:43 PM')).toBeInTheDocument()
    expect(within(row).getByText('209')).toBeInTheDocument()
    expect(within(row).getByText(/8.11 per share/)).toBeInTheDocument()
    expect(within(row).getByText(/Degiro/)).toBeInTheDocument()
  })

  // The ledger is kept in the currency it settled in and read in the one the
  // rest of the app counts in, so it states both.
  it('states the amount in the base currency and in the one it settled in', () => {
    mocks.trades = [
      trade({ _id: 't-buy', instrumentId: WORLD._id, quantity: 209, amount: -1694.99 }),
    ]

    renderCard()

    const row = screen.getByRole('row', { name: /Invesco/ })
    // -1,694.99 EUR at 4.32.
    expect(within(row).getByText('-7,322.36')).toBeInTheDocument()
    expect(within(row).getByText('-1,694.99 EUR')).toBeInTheDocument()
  })

  // Converted at the rate of the day it happened, not today's: a payment
  // received in 2024 is 2024 money whatever the currency has done since.
  it('converts each row at the rate of its own day', () => {
    mocks.trades = [
      trade({ _id: 't-old', date: '2024-06-24T10:00:00.000Z', amount: -100 }),
      trade({ _id: 't-new', date: '2026-07-27T10:00:00.000Z', amount: -100 }),
    ]
    const rates: Record<string, number> = { '2024-06-24': 4, '2026-07-27': 5 }

    renderCard((amount, currency, onDate) =>
      currency === 'EUR' ? amount * rates[onDate.toISOString().split('T')[0]] : null
    )

    expect(screen.getByText('-400.00')).toBeInTheDocument()
    expect(screen.getByText('-500.00')).toBeInTheDocument()
  })

  it('leaves a row it cannot convert in the currency it settled in', () => {
    mocks.trades = [trade({ _id: 't-brl', kind: 'dividend', amount: 12.5, currency: 'BRL' })]

    renderCard()

    const row = screen.getByRole('row', { name: /Dividend/ })
    expect(within(row).getByText('12.50')).toBeInTheDocument()
    expect(within(row).getByText('BRL')).toBeInTheDocument()
  })

  it('names a row that belongs to no holding by what it is', () => {
    mocks.trades = [
      trade({ _id: 't-interest', kind: 'interest', amount: 0.01, note: undefined }),
      trade({ _id: 't-deposit', kind: 'adjustment', amount: 1000, note: 'Deposit' }),
    ]

    renderCard()

    expect(screen.getByRole('row', { name: /Interest/ })).toHaveTextContent('Interest')
    expect(screen.getByRole('row', { name: /Deposit/ })).toHaveTextContent('Deposit')
  })

  // A date-only row parses to midnight, and "12:00 AM" on every second row is
  // noise rather than information.
  it('leaves the time off a row that never carried one', () => {
    mocks.trades = [trade({ _id: 't-flat', date: '2026-07-27T00:00:00.000Z', amount: -10 })]

    renderCard()

    expect(screen.getByText('Jul 27, 2026')).toBeInTheDocument()
    expect(screen.queryByText('12:00 AM')).not.toBeInTheDocument()
  })

  // The first page is meant to be the last few things that happened, whatever
  // order the rows arrive in.
  it('puts the most recent row first, and an undateable one last', () => {
    mocks.trades = [
      trade({ _id: 't-old', date: '2024-06-24T10:00:00.000Z', amount: -1 }),
      trade({ _id: 't-broken', date: 'not a date', amount: -2 }),
      trade({ _id: 't-new', date: '2026-07-27T10:00:00.000Z', amount: -3 }),
    ]

    renderCard()

    const dates = screen
      .getAllByRole('row')
      .slice(1)
      .map(row => row.textContent)
    expect(dates[0]).toContain('Jul 27, 2026')
    expect(dates[1]).toContain('Jun 24, 2024')
    // A row the parser could not place in time is listed, not lost - and it
    // does not take the ledger down with it, which is what formatting an
    // unreadable date does.
    expect(dates[2]).toContain('Undated')
  })

  // The last few things that happened is what is wanted at a glance; the rest
  // is a ledger, and it is one click away.
  it('shows the last ten and hands over the rest on request', async () => {
    const user = userEvent.setup()
    mocks.trades = Array.from({ length: 24 }, (_, index) =>
      trade({ _id: `t-${index}`, instrumentId: WORLD._id, quantity: index + 1, amount: -10 })
    )

    renderCard()

    expect(screen.getAllByRole('row')).toHaveLength(11) // ten rows plus the header

    await user.click(screen.getByRole('button', { name: 'Show more (14 left)' }))
    expect(screen.getAllByRole('row')).toHaveLength(21)

    await user.click(screen.getByRole('button', { name: 'Show more (4 left)' }))
    expect(screen.getAllByRole('row')).toHaveLength(25)
    expect(screen.queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument()
  })

  it('counts everything it holds, not just the page in view', () => {
    mocks.trades = Array.from({ length: 30 }, (_, index) =>
      trade({ _id: `t-${index}`, amount: -10 })
    )

    renderCard()

    expect(screen.getByRole('heading', { name: /Transactions/ })).toHaveTextContent('(30)')
    expect(screen.getAllByRole('row')).toHaveLength(11)
  })
})
