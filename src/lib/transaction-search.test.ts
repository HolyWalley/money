import { describe, it, expect } from 'vitest'
import { matchesSearch, searchTransactions } from './transaction-search'
import type { Transaction } from '../../shared/schemas/transaction.schema'

function tx(fields: Partial<Transaction>): Transaction {
  return { _id: 't1', amount: 10, ...fields } as Transaction
}

describe('matchesSearch', () => {
  it('keeps everything for an empty query', () => {
    expect(matchesSearch(tx({ note: 'Coffee' }), '')).toBe(true)
    expect(matchesSearch(tx({ note: 'Coffee' }), '   ')).toBe(true)
  })

  it('matches part of a note, whatever the case', () => {
    expect(matchesSearch(tx({ note: 'Morning coffee' }), 'COFFEE')).toBe(true)
    expect(matchesSearch(tx({ note: 'Morning coffee' }), 'ffe')).toBe(true)
    expect(matchesSearch(tx({ note: 'Morning coffee' }), 'tea')).toBe(false)
  })

  it('ignores the query around the edges', () => {
    expect(matchesSearch(tx({ note: 'Coffee' }), '  coffee  ')).toBe(true)
  })

  it('leaves a transaction with no note out of a text search', () => {
    expect(matchesSearch(tx({ amount: 12 }), 'coffee')).toBe(false)
  })

  it('reads a number as the start of an amount', () => {
    expect(matchesSearch(tx({ amount: 12 }), '12')).toBe(true)
    expect(matchesSearch(tx({ amount: 12.5 }), '12')).toBe(true)
    expect(matchesSearch(tx({ amount: 120 }), '12')).toBe(true)
    expect(matchesSearch(tx({ amount: 13 }), '12')).toBe(false)
  })

  it('reads a decimal however it was typed', () => {
    expect(matchesSearch(tx({ amount: 12.5 }), '12.5')).toBe(true)
    expect(matchesSearch(tx({ amount: 12.5 }), '12,5')).toBe(true)
    expect(matchesSearch(tx({ amount: 12.5 }), '12.6')).toBe(false)
  })

  it('reads the second amount of a transfer too', () => {
    expect(matchesSearch(tx({ amount: 10, toAmount: 42 }), '42')).toBe(true)
  })

  // Otherwise a note is unreachable the moment it starts with a digit.
  it('still searches notes for a number', () => {
    expect(matchesSearch(tx({ amount: 40, note: '12 pack' }), '12')).toBe(true)
  })

  it('never reads a word as an amount', () => {
    expect(matchesSearch(tx({ amount: 12 }), '12 pack')).toBe(false)
  })
})

describe('searchTransactions', () => {
  const transactions = [
    tx({ _id: 't1', amount: 12, note: 'Coffee' }),
    tx({ _id: 't2', amount: 120, note: 'Rent' }),
    tx({ _id: 't3', amount: 8 }),
  ]

  it('hands back the same array for an empty query', () => {
    expect(searchTransactions(transactions, '  ')).toBe(transactions)
  })

  it('keeps only what matches', () => {
    expect(searchTransactions(transactions, 'coffee').map(t => t._id)).toEqual(['t1'])
    expect(searchTransactions(transactions, '12').map(t => t._id)).toEqual(['t1', 't2'])
    expect(searchTransactions(transactions, 'nothing')).toEqual([])
  })
})
