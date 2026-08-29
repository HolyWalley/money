import { describe, it, expect } from 'vitest'
import type { QuickFilter } from '@/contexts/FilterContext'
import {
  formatQuickFilterValues,
  getQuickFilterOptions,
  getUnusedQuickFilterTypes,
  groupQuickFiltersByType,
} from './quick-filter-options'
import type { Category } from '../../shared/schemas/category.schema'
import type { Wallet } from '../../shared/schemas/wallet.schema'

const wallets = [
  { _id: 'w1', name: 'Cash', currency: 'USD' },
  { _id: 'w2', name: 'Revolut', currency: 'EUR' },
] as Wallet[]

const categories = [
  { _id: 'c1', name: 'Food' },
  { _id: 'c2', name: 'Rent' },
] as Category[]

const filter = (type: QuickFilter['type'], value: string, label: string): QuickFilter => ({
  id: `${type}-${value}`,
  type,
  value,
  label,
})

describe('getQuickFilterOptions', () => {
  it('labels wallets the way the transaction rows do', () => {
    expect(getQuickFilterOptions('wallet', wallets, categories)).toEqual([
      { value: 'w1', label: 'Cash (USD)' },
      { value: 'w2', label: 'Revolut (EUR)' },
    ])
  })

  it('labels categories by name', () => {
    expect(getQuickFilterOptions('category', wallets, categories)).toEqual([
      { value: 'c1', label: 'Food' },
      { value: 'c2', label: 'Rent' },
    ])
  })

  it('offers the three transaction types', () => {
    expect(getQuickFilterOptions('transactionType', wallets, categories)).toEqual([
      { value: 'income', label: 'Income' },
      { value: 'expense', label: 'Expense' },
      { value: 'transfer', label: 'Transfer' },
    ])
  })

  it('returns nothing when there is nothing to pick', () => {
    expect(getQuickFilterOptions('wallet', [], [])).toEqual([])
  })
})

describe('groupQuickFiltersByType', () => {
  it('puts every value of a type in one group', () => {
    const groups = groupQuickFiltersByType([
      filter('wallet', 'w1', 'Cash (USD)'),
      filter('category', 'c1', 'Food'),
      filter('wallet', 'w2', 'Revolut (EUR)'),
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0].type).toBe('wallet')
    expect(groups[0].filters.map(f => f.value)).toEqual(['w1', 'w2'])
    expect(groups[1].filters.map(f => f.value)).toEqual(['c1'])
  })

  it('orders groups consistently regardless of the order filters were added', () => {
    const categoryFirst = groupQuickFiltersByType([
      filter('category', 'c1', 'Food'),
      filter('wallet', 'w1', 'Cash (USD)'),
    ])

    expect(categoryFirst.map(g => g.type)).toEqual(['wallet', 'category'])
  })

  it('drops types with no values', () => {
    expect(groupQuickFiltersByType([])).toEqual([])
  })
})

describe('getUnusedQuickFilterTypes', () => {
  it('lists every type when nothing is filtered', () => {
    expect(getUnusedQuickFilterTypes([])).toEqual(['wallet', 'category', 'transactionType'])
  })

  it('omits types that already have a value', () => {
    expect(getUnusedQuickFilterTypes([filter('wallet', 'w1', 'Cash (USD)')]))
      .toEqual(['category', 'transactionType'])
  })

  it('is empty once all three are in use', () => {
    expect(getUnusedQuickFilterTypes([
      filter('wallet', 'w1', 'Cash (USD)'),
      filter('category', 'c1', 'Food'),
      filter('transactionType', 'expense', 'Expense'),
    ])).toEqual([])
  })
})

describe('formatQuickFilterValues', () => {
  it('names a single value', () => {
    expect(formatQuickFilterValues([filter('wallet', 'w1', 'Cash (USD)')])).toBe('Cash (USD)')
  })

  it('joins values up to the limit', () => {
    expect(formatQuickFilterValues([
      filter('wallet', 'w1', 'Cash'),
      filter('wallet', 'w2', 'Revolut'),
    ])).toBe('Cash, Revolut')
  })

  it('counts the rest once past the limit', () => {
    expect(formatQuickFilterValues([
      filter('wallet', 'w1', 'Cash'),
      filter('wallet', 'w2', 'Revolut'),
      filter('wallet', 'w3', 'Bank'),
      filter('wallet', 'w4', 'Savings'),
    ])).toBe('Cash, Revolut +2')
  })
})
