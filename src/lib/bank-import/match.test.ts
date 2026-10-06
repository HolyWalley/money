import { describe, it, expect } from 'vitest'
import type { Transaction } from '../../../shared/schemas/transaction.schema'
import { reviewOperations, type ReviewContext } from './match'
import type { BankOperation } from './types'

function operation(overrides: Partial<BankOperation> = {}): BankOperation {
  return {
    externalId: 'mbank:1',
    bank: 'mbank',
    account: 'mbank:12345678',
    date: '2026-10-04T11:13:00.000Z',
    direction: 'expense',
    amount: 116,
    currency: 'PLN',
    counterparty: 'ANNA NOWAK',
    title: 'CZYNSZ',
    description: 'row',
    suggestTransfer: false,
    ...overrides,
  }
}

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    _id: 't1',
    type: 'transaction',
    transactionType: 'expense',
    amount: 116,
    currency: 'PLN',
    categoryId: 'c1',
    walletId: 'w1',
    date: '2026-10-04T09:00:00.000Z',
    createdAt: '2026-10-04T09:00:00.000Z',
    updatedAt: '2026-10-04T09:00:00.000Z',
    ...overrides,
  }
}

function context(overrides: Partial<ReviewContext> = {}): ReviewContext {
  return { transactions: [], accountWallets: {}, dismissed: [], walletIds: ['w1', 'w2'], ...overrides }
}

describe('reviewOperations', () => {
  it('returns a new operation with nothing prefilled', () => {
    expect(reviewOperations([operation()], context())).toEqual([
      { operation: operation(), walletId: undefined, matchedTransactionId: undefined },
    ])
  })

  it('drops an operation that was already imported', () => {
    const imported = transaction({ externalId: 'mbank:1' })

    expect(reviewOperations([operation()], context({ transactions: [imported] }))).toEqual([])
  })

  it('drops an operation that was dismissed', () => {
    expect(reviewOperations([operation()], context({ dismissed: ['mbank:1'] }))).toEqual([])
  })

  it('prefills the wallet the account was imported into before', () => {
    const [item] = reviewOperations([operation()], context({ accountWallets: { 'mbank:12345678/PLN': 'w2' } }))

    expect(item.walletId).toBe('w2')
  })

  it('forgets a mapping to a wallet that no longer exists', () => {
    const [item] = reviewOperations([operation()], context({ accountWallets: { 'mbank:12345678/PLN': 'gone' } }))

    expect(item.walletId).toBeUndefined()
  })

  it('pairs an operation with a hand-entered transaction of the same amount and day', () => {
    const [item] = reviewOperations([operation()], context({ transactions: [transaction()] }))

    expect(item.matchedTransactionId).toBe('t1')
  })

  it('pairs two identical transfers with one hand-entered record only once', () => {
    const items = reviewOperations(
      [operation(), operation({ externalId: 'mbank:2', date: '2026-10-04T11:25:00.000Z' })],
      context({ transactions: [transaction()] })
    )

    expect(items.map((item) => item.matchedTransactionId)).toEqual(['t1', undefined])
  })

  it('does not pair across a different amount, currency, direction or a distant day', () => {
    const others = [
      transaction({ _id: 'amount', amount: 115 }),
      transaction({ _id: 'currency', currency: 'EUR' }),
      transaction({ _id: 'direction', transactionType: 'income' }),
      transaction({ _id: 'day', date: '2026-10-01T09:00:00.000Z' }),
    ]

    const [item] = reviewOperations([operation()], context({ transactions: others }))

    expect(item.matchedTransactionId).toBeUndefined()
  })

  it('only pairs within the mapped wallet once the account is mapped', () => {
    const [item] = reviewOperations(
      [operation()],
      context({ transactions: [transaction({ walletId: 'w1' })], accountWallets: { 'mbank:12345678/PLN': 'w2' } })
    )

    expect(item.matchedTransactionId).toBeUndefined()
  })

  it('pairs an outgoing operation with a transfer out of the wallet', () => {
    const transfer = transaction({ transactionType: 'transfer', toWalletId: 'w2' })

    const [item] = reviewOperations([operation()], context({ transactions: [transfer] }))

    expect(item.matchedTransactionId).toBe('t1')
  })

  it('pairs an incoming operation with what a transfer delivered', () => {
    const transfer = transaction({
      transactionType: 'transfer',
      amount: 30,
      currency: 'EUR',
      toWalletId: 'w2',
      toAmount: 116,
      toCurrency: 'PLN',
    })

    const [item] = reviewOperations(
      [operation({ direction: 'income' })],
      context({ transactions: [transfer], accountWallets: { 'mbank:12345678/PLN': 'w2' } })
    )

    expect(item.matchedTransactionId).toBe('t1')
  })

  it('prefers the nearest of several candidates', () => {
    const near = transaction({ _id: 'near', date: '2026-10-04T11:00:00.000Z' })
    const far = transaction({ _id: 'far', date: '2026-10-05T11:00:00.000Z' })

    const [item] = reviewOperations([operation()], context({ transactions: [far, near] }))

    expect(item.matchedTransactionId).toBe('near')
  })
})
