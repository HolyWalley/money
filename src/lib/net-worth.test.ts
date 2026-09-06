import { describe, it, expect } from 'vitest'
import {
  computeWalletBalances,
  summarizeNetWorth,
  type BalanceWallet,
  type InvestmentHoldings,
} from './net-worth'
import type { BalanceTransaction } from './wallet-balance'
import type { Converter } from './currency-conversion'

const everyday: BalanceWallet = { _id: 'w-1', currency: 'EUR', initialBalance: 100, isSavings: false }
const vault: BalanceWallet = { _id: 'w-2', currency: 'EUR', initialBalance: 500, isSavings: true }
const foreign: BalanceWallet = { _id: 'w-3', currency: 'PLN', initialBalance: 0, isSavings: false }

function expense(walletId: string, amount: number): BalanceTransaction {
  return { transactionType: 'expense', amount, currency: 'EUR', walletId }
}

function income(walletId: string, amount: number): BalanceTransaction {
  return { transactionType: 'income', amount, currency: 'EUR', walletId }
}

function transfer(from: string, to: string, amount: number): BalanceTransaction {
  return { transactionType: 'transfer', amount, currency: 'EUR', walletId: from, toWalletId: to, toCurrency: 'EUR' }
}

// Halves anything in PLN, so a converted figure is visibly not the raw one.
const convert: Converter = (amount, currency) => {
  if (currency === 'EUR') return amount
  if (currency === 'PLN') return amount / 2
  return null
}

describe('computeWalletBalances', () => {
  it('starts every wallet at its initial balance', () => {
    const balances = computeWalletBalances([everyday, vault], [])

    expect(balances.get('w-1')).toBe(100)
    expect(balances.get('w-2')).toBe(500)
  })

  it('applies income and expense to the wallet that carried them', () => {
    const balances = computeWalletBalances([everyday], [income('w-1', 50), expense('w-1', 30)])

    expect(balances.get('w-1')).toBe(120)
  })

  it('moves a transfer out of one wallet and into the other', () => {
    const balances = computeWalletBalances([everyday, vault], [transfer('w-1', 'w-2', 40)])

    expect(balances.get('w-1')).toBe(60)
    expect(balances.get('w-2')).toBe(540)
  })

  it('takes the received amount when a transfer crosses currencies', () => {
    const balances = computeWalletBalances(
      [everyday, foreign],
      [{ transactionType: 'transfer', amount: 10, currency: 'EUR', walletId: 'w-1', toWalletId: 'w-3', toAmount: 43, toCurrency: 'PLN' }]
    )

    expect(balances.get('w-1')).toBe(90)
    expect(balances.get('w-3')).toBe(43)
  })

  // The delta covers both sides at once, so a wallet on both sides of the same
  // transfer must not be credited twice.
  it('does not pay a wallet transferring to itself twice', () => {
    const balances = computeWalletBalances([everyday], [transfer('w-1', 'w-1', 40)])

    expect(balances.get('w-1')).toBe(100)
  })

  it('ignores transactions belonging to a wallet that is gone', () => {
    const balances = computeWalletBalances([everyday], [expense('deleted', 30)])

    expect(balances.get('w-1')).toBe(100)
    expect(balances.has('deleted')).toBe(false)
  })
})

function holdings(overrides: Partial<InvestmentHoldings> = {}): InvestmentHoldings {
  return { marketValue: 0, missingCurrencies: [], unvalued: 0, ...overrides }
}

describe('summarizeNetWorth', () => {
  it('keeps savings apart from what is actually spendable', () => {
    const summary = summarizeNetWorth([everyday, vault], new Map([['w-1', 100], ['w-2', 500]]), convert)

    expect(summary).toEqual({
      total: 600,
      spendable: 100,
      savings: 500,
      investments: null,
      missingCurrencies: [],
      unvaluedHoldings: 0,
    })
  })

  it('converts each wallet out of its own currency', () => {
    const summary = summarizeNetWorth([everyday, foreign], new Map([['w-1', 100], ['w-3', 400]]), convert)

    expect(summary.spendable).toBe(300)
    expect(summary.total).toBe(300)
  })

  it('counts an overdrawn wallet against the total', () => {
    const summary = summarizeNetWorth([everyday, vault], new Map([['w-1', -50], ['w-2', 500]]), convert)

    expect(summary.spendable).toBe(-50)
    expect(summary.total).toBe(450)
  })

  it('treats a wallet with no computed balance as empty', () => {
    const summary = summarizeNetWorth([everyday], new Map(), convert)

    expect(summary.total).toBe(0)
  })

  // Reporting the shortfall is what lets the card say the figure is partial
  // instead of presenting an understated total as the whole picture.
  it('names a currency it could not convert and leaves it out of the total', () => {
    const unpriced: BalanceWallet = { _id: 'w-4', currency: 'USD', initialBalance: 0, isSavings: false }
    const summary = summarizeNetWorth([everyday, unpriced], new Map([['w-1', 100], ['w-4', 999]]), convert)

    expect(summary.total).toBe(100)
    expect(summary.missingCurrencies).toEqual(['USD'])
  })

  it('names each unconvertible currency once', () => {
    const unpricedA: BalanceWallet = { _id: 'w-4', currency: 'USD', initialBalance: 0, isSavings: false }
    const unpricedB: BalanceWallet = { _id: 'w-5', currency: 'USD', initialBalance: 0, isSavings: true }
    const summary = summarizeNetWorth([unpricedA, unpricedB], new Map([['w-4', 10], ['w-5', 20]]), convert)

    expect(summary.missingCurrencies).toEqual(['USD'])
  })

  it('counts holdings towards net worth as a bucket of their own', () => {
    const summary = summarizeNetWorth(
      [everyday, vault],
      new Map([['w-1', 100], ['w-2', 500]]),
      convert,
      holdings({ marketValue: 2400 })
    )

    expect(summary.total).toBe(3000)
    expect(summary.investments).toBe(2400)
  })

  // A brokerage balance is not this month's grocery money, however well the
  // market did.
  it('leaves what is spendable alone however the market moved', () => {
    const flat = summarizeNetWorth([everyday], new Map([['w-1', 100]]), convert, holdings({ marketValue: 0 }))
    const soaring = summarizeNetWorth([everyday], new Map([['w-1', 100]]), convert, holdings({ marketValue: 90000 }))

    expect(flat.spendable).toBe(100)
    expect(soaring.spendable).toBe(100)
    expect(soaring.savings).toBe(0)
  })

  // The common case: someone who invests through nobody should see the same
  // three figures they saw before any of this existed.
  it('reports no investments at all when there is no brokerage', () => {
    const summary = summarizeNetWorth([everyday, vault], new Map([['w-1', 100], ['w-2', 500]]), convert)

    expect(summary.investments).toBeNull()
    expect(summary.unvaluedHoldings).toBe(0)
    expect(summary.total).toBe(600)
  })

  it('distinguishes an empty brokerage from no brokerage', () => {
    const summary = summarizeNetWorth([everyday], new Map([['w-1', 100]]), convert, holdings())

    expect(summary.investments).toBe(0)
  })

  it('names a currency the portfolio could not convert alongside the wallets it could not', () => {
    const unpriced: BalanceWallet = { _id: 'w-4', currency: 'USD', initialBalance: 0, isSavings: false }
    const summary = summarizeNetWorth(
      [everyday, unpriced],
      new Map([['w-1', 100], ['w-4', 999]]),
      convert,
      holdings({ marketValue: 50, missingCurrencies: ['GBP'] })
    )

    expect(summary.missingCurrencies).toEqual(['GBP', 'USD'])
    expect(summary.total).toBe(150)
  })

  it('names a currency both sides are missing only once', () => {
    const unpriced: BalanceWallet = { _id: 'w-4', currency: 'USD', initialBalance: 0, isSavings: false }
    const summary = summarizeNetWorth(
      [unpriced],
      new Map([['w-4', 999]]),
      convert,
      holdings({ missingCurrencies: ['USD'] })
    )

    expect(summary.missingCurrencies).toEqual(['USD'])
  })

  // A total that quietly drops an unpriced holding reads as a smaller net
  // worth rather than an incomplete one.
  it('carries the count of holdings nothing could value', () => {
    const summary = summarizeNetWorth(
      [everyday],
      new Map([['w-1', 100]]),
      convert,
      holdings({ marketValue: 400, unvalued: 2 })
    )

    expect(summary.unvaluedHoldings).toBe(2)
    expect(summary.total).toBe(500)
  })

  // The broker's cash is an ordinary wallet of the user's own; only positions
  // arrive through `investments`, so the balance is banked exactly once.
  it('counts a broker cash wallet once, not once per bucket', () => {
    const brokerCash: BalanceWallet = { _id: 'w-broker', currency: 'EUR', initialBalance: 0, isSavings: false }
    const summary = summarizeNetWorth(
      [everyday, brokerCash],
      new Map([['w-1', 100], ['w-broker', 750]]),
      convert,
      holdings({ marketValue: 2400 })
    )

    expect(summary.spendable).toBe(850)
    expect(summary.investments).toBe(2400)
    expect(summary.total).toBe(3250)
  })
})
