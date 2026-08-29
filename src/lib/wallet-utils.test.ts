import { describe, it, expect } from 'vitest'
import { formatWalletName, formatWalletBalance, getWalletNameById, UNKNOWN_WALLET_NAME } from './wallet-utils'

const wallets = [
  { _id: 'wallet-1', name: 'Revolut', currency: 'USD' as const },
  { _id: 'wallet-2', name: 'Revolut', currency: 'EUR' as const },
]

describe('formatWalletName', () => {
  it('appends the currency to the wallet name', () => {
    expect(formatWalletName({ name: 'Revolut', currency: 'USD' })).toBe('Revolut (USD)')
  })

  it('distinguishes wallets that share a name', () => {
    expect(formatWalletName(wallets[0])).not.toBe(formatWalletName(wallets[1]))
  })
})

describe('getWalletNameById', () => {
  it('formats the matching wallet', () => {
    expect(getWalletNameById(wallets, 'wallet-2')).toBe('Revolut (EUR)')
  })

  it('falls back when the wallet is missing', () => {
    expect(getWalletNameById(wallets, 'nope')).toBe(UNKNOWN_WALLET_NAME)
  })

  it('falls back for an empty wallet list', () => {
    expect(getWalletNameById([], 'wallet-1')).toBe(UNKNOWN_WALLET_NAME)
  })
})

describe('formatWalletBalance', () => {
  it('always shows two decimals', () => {
    expect(formatWalletBalance(1151)).toBe('1,151.00')
    expect(formatWalletBalance(1151.5)).toBe('1,151.50')
  })

  it('groups thousands', () => {
    expect(formatWalletBalance(1234567.891)).toBe('1,234,567.89')
  })

  it('keeps negatives signed', () => {
    expect(formatWalletBalance(-42.5)).toBe('-42.50')
  })
})
