import { describe, it, expect } from 'vitest'
import { formatWalletName, getWalletNameById, UNKNOWN_WALLET_NAME } from './wallet-utils'

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
