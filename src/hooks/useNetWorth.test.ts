import { renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useNetWorth } from './useNetWorth'
import type { PortfolioSummary } from '@/lib/positions'
import type { BrokerAccount } from '../../shared/schemas/broker-account.schema'
import type { Wallet } from '../../shared/schemas/wallet.schema'

const mocks = vi.hoisted(() => ({
  wallets: [] as Wallet[],
  balances: new Map<string, number>(),
  brokerAccounts: [] as BrokerAccount[],
  portfolio: {
    cost: 0,
    marketValue: 0,
    unrealised: 0,
    realised: 0,
    dividends: 0,
    totalReturn: 0,
    missingPrices: [] as string[],
    missingCurrencies: [] as string[],
    unquantified: [] as string[],
  } as PortfolioSummary,
}))

vi.mock('./useLiveWallets', () => ({
  useLiveWallets: () => mocks.wallets,
}))

vi.mock('./useWalletBalances', () => ({
  useWalletBalances: () => mocks.balances,
}))

vi.mock('./useLiveBrokerAccounts', () => ({
  useLiveBrokerAccounts: () => mocks.brokerAccounts,
}))

vi.mock('./usePortfolio', () => ({
  usePortfolio: () => ({
    positions: [],
    summary: mocks.portfolio,
    needsSymbol: [],
    baseCurrency: 'EUR',
    asOf: new Date(),
    isLoading: false,
  }),
}))

// Halves anything in PLN and reaches nothing else, so a converted figure is
// visibly not the raw one and an unreachable currency stays unreachable.
vi.mock('./useCurrentRates', () => ({
  useCurrentRates: () => ({
    convert: (amount: number, currency: string) => {
      if (currency === 'EUR') return amount
      if (currency === 'PLN') return amount / 2
      return null
    },
    baseCurrency: 'EUR',
    isLoading: false,
  }),
}))

function wallet(id: string, balance: number, overrides: Partial<Wallet> = {}): Wallet {
  mocks.balances.set(id, balance)
  return {
    _id: id,
    type: 'wallet',
    name: id,
    currency: 'EUR',
    initialBalance: 0,
    isSavings: false,
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Wallet
}

function brokerAccount(overrides: Partial<BrokerAccount> = {}): BrokerAccount {
  return {
    _id: 'ba-1',
    type: 'brokerAccount',
    name: 'DeGiro',
    broker: 'degiro',
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function portfolio(overrides: Partial<PortfolioSummary>) {
  mocks.portfolio = { ...mocks.portfolio, ...overrides }
}

beforeEach(() => {
  mocks.wallets = []
  mocks.balances = new Map()
  mocks.brokerAccounts = []
  mocks.portfolio = {
    cost: 0,
    marketValue: 0,
    unrealised: 0,
    realised: 0,
    dividends: 0,
    totalReturn: 0,
    missingPrices: [],
    missingCurrencies: [],
    unquantified: [],
  }
})

describe('useNetWorth', () => {
  it('adds what is held through a broker to net worth', () => {
    mocks.wallets = [wallet('w-1', 100), wallet('w-2', 500, { isSavings: true })]
    mocks.brokerAccounts = [brokerAccount()]
    portfolio({ marketValue: 2400 })

    const { result } = renderHook(() => useNetWorth())

    expect(result.current.total).toBe(3000)
    expect(result.current.investments).toBe(2400)
  })

  // A brokerage balance is not this month's grocery money.
  it('does not let a rising portfolio inflate what is spendable', () => {
    mocks.wallets = [wallet('w-1', 100), wallet('w-2', 500, { isSavings: true })]
    mocks.brokerAccounts = [brokerAccount()]
    portfolio({ marketValue: 90000 })

    const { result } = renderHook(() => useNetWorth())

    expect(result.current.spendable).toBe(100)
    expect(result.current.savings).toBe(500)
  })

  // The common case, and it must keep looking exactly as it did before any of
  // this existed.
  it('reports nothing about investments when the user has no broker account', () => {
    mocks.wallets = [wallet('w-1', 100)]
    // Trades left behind by an account that is gone still say nothing about a
    // user who does not invest.
    portfolio({ marketValue: 2400, missingPrices: ['i-1'] })

    const { result } = renderHook(() => useNetWorth())

    expect(result.current.investments).toBeNull()
    expect(result.current.unvaluedHoldings).toBe(0)
    expect(result.current.total).toBe(100)
  })

  it('shows an empty brokerage as zero rather than as nothing', () => {
    mocks.wallets = [wallet('w-1', 100)]
    mocks.brokerAccounts = [brokerAccount()]

    const { result } = renderHook(() => useNetWorth())

    expect(result.current.investments).toBe(0)
    expect(result.current.total).toBe(100)
  })

  // Only positions come from the portfolio. The broker's cash is an ordinary
  // wallet, already counted as spendable.
  it('counts a broker cash wallet once', () => {
    const cash = wallet('w-cash', 750)
    mocks.wallets = [wallet('w-1', 100), cash]
    mocks.brokerAccounts = [brokerAccount({ cashWalletId: cash._id })]
    portfolio({ marketValue: 2400 })

    const { result } = renderHook(() => useNetWorth())

    expect(result.current.spendable).toBe(850)
    expect(result.current.investments).toBe(2400)
    expect(result.current.total).toBe(3250)
  })

  it('names the currencies neither the wallets nor the portfolio could convert', () => {
    mocks.wallets = [wallet('w-1', 100), wallet('w-2', 999, { currency: 'USD' })]
    mocks.brokerAccounts = [brokerAccount()]
    portfolio({ marketValue: 50, missingCurrencies: ['GBP'] })

    const { result } = renderHook(() => useNetWorth())

    expect(result.current.missingCurrencies).toEqual(['GBP', 'USD'])
    expect(result.current.total).toBe(150)
  })

  it('counts an unpriced holding and an uncounted one alike as missing from the total', () => {
    mocks.wallets = [wallet('w-1', 100)]
    mocks.brokerAccounts = [brokerAccount()]
    portfolio({ marketValue: 400, missingPrices: ['i-1', 'i-2'], unquantified: ['i-3'] })

    const { result } = renderHook(() => useNetWorth())

    expect(result.current.unvaluedHoldings).toBe(3)
  })

  it('converts a wallet out of its own currency before banking it', () => {
    mocks.wallets = [wallet('w-1', 100), wallet('w-2', 400, { currency: 'PLN' })]
    mocks.brokerAccounts = [brokerAccount()]
    portfolio({ marketValue: 1000 })

    const { result } = renderHook(() => useNetWorth())

    expect(result.current.spendable).toBe(300)
    expect(result.current.total).toBe(1300)
  })
})
