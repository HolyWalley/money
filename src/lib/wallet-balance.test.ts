import { describe, it, expect } from 'vitest'
import { getWalletBalanceDelta, projectWalletBalance, type BalanceTransaction } from './wallet-balance'

function tx(overrides: Partial<BalanceTransaction> = {}): BalanceTransaction {
  return {
    transactionType: 'expense',
    amount: 10,
    currency: 'USD',
    walletId: 'wallet-1',
    ...overrides,
  }
}

describe('getWalletBalanceDelta', () => {
  it('adds income and subtracts expenses for the owning wallet', () => {
    expect(getWalletBalanceDelta(tx({ transactionType: 'income', amount: 250 }), 'wallet-1')).toBe(250)
    expect(getWalletBalanceDelta(tx({ transactionType: 'expense', amount: 40 }), 'wallet-1')).toBe(-40)
  })

  it('moves a same-currency transfer between both sides', () => {
    const transfer = tx({
      transactionType: 'transfer', amount: 40, currency: 'USD',
      walletId: 'wallet-1', toWalletId: 'wallet-2', toCurrency: 'USD',
    })

    expect(getWalletBalanceDelta(transfer, 'wallet-1')).toBe(-40)
    expect(getWalletBalanceDelta(transfer, 'wallet-2')).toBe(40)
  })

  it('credits the converted amount on a cross-currency transfer', () => {
    const transfer = tx({
      transactionType: 'transfer', amount: 100, currency: 'USD',
      toAmount: 92, toCurrency: 'EUR', walletId: 'wallet-1', toWalletId: 'wallet-2',
    })

    expect(getWalletBalanceDelta(transfer, 'wallet-1')).toBe(-100)
    expect(getWalletBalanceDelta(transfer, 'wallet-2')).toBe(92)
  })

  it('returns zero for an unrelated wallet', () => {
    expect(getWalletBalanceDelta(tx({ transactionType: 'income', amount: 250 }), 'wallet-9')).toBe(0)
  })

  it('nets out a transfer naming the same wallet on both sides', () => {
    const transfer = tx({
      transactionType: 'transfer', amount: 40, currency: 'USD',
      walletId: 'wallet-1', toWalletId: 'wallet-1', toCurrency: 'USD',
    })

    expect(getWalletBalanceDelta(transfer, 'wallet-1')).toBe(0)
  })
})

describe('projectWalletBalance', () => {
  describe('creating a transaction', () => {
    it('subtracts a new expense', () => {
      expect(projectWalletBalance(1250, 'wallet-1', tx({ amount: 99 }), null)).toBe(1151)
    })

    it('adds a new income', () => {
      expect(projectWalletBalance(1250, 'wallet-1', tx({ transactionType: 'income', amount: 99 }), null)).toBe(1349)
    })

    it('leaves the balance alone until an amount is entered', () => {
      expect(projectWalletBalance(1250, 'wallet-1', tx({ amount: 0 }), null)).toBe(1250)
    })

    it('projects both sides of a transfer', () => {
      const transfer = tx({
        transactionType: 'transfer', amount: 100, currency: 'USD',
        toAmount: 92, toCurrency: 'EUR', walletId: 'wallet-1', toWalletId: 'wallet-2',
      })

      expect(projectWalletBalance(1250, 'wallet-1', transfer, null)).toBe(1150)
      expect(projectWalletBalance(400, 'wallet-2', transfer, null)).toBe(492)
    })
  })

  describe('editing a transaction', () => {
    // The balance of 1151 already reflects the 99 expense being edited.
    const existing = tx({ amount: 99 })

    it('backs out the old amount before applying the new one', () => {
      expect(projectWalletBalance(1151, 'wallet-1', tx({ amount: 50 }), existing)).toBe(1200)
    })

    it('reports no change when nothing was edited', () => {
      expect(projectWalletBalance(1151, 'wallet-1', tx({ amount: 99 }), existing)).toBe(1151)
    })

    it('handles a switch from expense to income', () => {
      expect(projectWalletBalance(1151, 'wallet-1', tx({ transactionType: 'income', amount: 99 }), existing)).toBe(1349)
    })

    it('does not back anything out of a wallet the transaction never touched', () => {
      const moved = tx({ amount: 99, walletId: 'wallet-2' })

      expect(projectWalletBalance(400, 'wallet-2', moved, existing)).toBe(301)
    })

    it('restores the original wallet when the transaction is moved away', () => {
      const moved = tx({ amount: 99, walletId: 'wallet-2' })

      expect(projectWalletBalance(1151, 'wallet-1', moved, existing)).toBe(1250)
    })

    it('avoids floating point drift', () => {
      expect(projectWalletBalance(0.3, 'wallet-1', tx({ amount: 0.1 }), tx({ amount: 0.2 }))).toBe(0.4)
    })
  })
})
