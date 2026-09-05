import { describe, it, expect } from 'vitest'
import { computeWalletBalances, summarizeNetWorth, type BalanceWallet } from './net-worth'
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

describe('summarizeNetWorth', () => {
  it('keeps savings apart from what is actually spendable', () => {
    const summary = summarizeNetWorth([everyday, vault], new Map([['w-1', 100], ['w-2', 500]]), convert)

    expect(summary).toEqual({ total: 600, spendable: 100, savings: 500, missingCurrencies: [] })
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
})
