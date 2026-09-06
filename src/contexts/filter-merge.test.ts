import { describe, it, expect } from 'vitest'
import type { TransactionFilters } from '@/hooks/useLiveTransactions'
import type { QuickFilter } from './FilterContext'
import { mergeFilters } from './FilterProvider'

describe('mergeFilters', () => {
  const baseFilters: TransactionFilters = {
    categoryIds: ['cat1', 'cat2', 'cat3'],
    walletIds: ['wallet1', 'wallet2'],
    transactionTypeIds: ['income', 'expense', 'transfer'],
    period: {
      type: 'monthly',
      currentPeriod: 0,
      monthDay: 1,
    },
  }

  it('should return base filters when no quick filters', () => {
    const result = mergeFilters(baseFilters, [])
    expect(result).toBe(baseFilters)
  })

  it('should override categoryIds with quick category filter', () => {
    const quickFilters: QuickFilter[] = [
      { id: '1', type: 'category', value: 'cat1', label: 'Category 1' },
    ]

    const result = mergeFilters(baseFilters, quickFilters)

    expect(result.categoryIds).toEqual(['cat1'])
    expect(result.walletIds).toEqual(baseFilters.walletIds)
    expect(result.transactionTypeIds).toEqual(baseFilters.transactionTypeIds)
  })

  it('should override walletIds with quick wallet filter', () => {
    const quickFilters: QuickFilter[] = [
      { id: '1', type: 'wallet', value: 'wallet1', label: 'Wallet 1' },
    ]

    const result = mergeFilters(baseFilters, quickFilters)

    expect(result.walletIds).toEqual(['wallet1'])
    expect(result.categoryIds).toEqual(baseFilters.categoryIds)
    expect(result.transactionTypeIds).toEqual(baseFilters.transactionTypeIds)
  })

  it('should override transactionTypeIds with quick type filter', () => {
    const quickFilters: QuickFilter[] = [
      { id: '1', type: 'transactionType', value: 'expense', label: 'Expense' },
    ]

    const result = mergeFilters(baseFilters, quickFilters)

    expect(result.transactionTypeIds).toEqual(['expense'])
    expect(result.categoryIds).toEqual(baseFilters.categoryIds)
    expect(result.walletIds).toEqual(baseFilters.walletIds)
  })

  it('should support multiple quick filters of same type (OR logic)', () => {
    const quickFilters: QuickFilter[] = [
      { id: '1', type: 'wallet', value: 'wallet1', label: 'Wallet 1' },
      { id: '2', type: 'wallet', value: 'wallet2', label: 'Wallet 2' },
    ]

    const result = mergeFilters(baseFilters, quickFilters)

    expect(result.walletIds).toEqual(['wallet1', 'wallet2'])
  })

  it('should support quick filters of different types simultaneously', () => {
    const quickFilters: QuickFilter[] = [
      { id: '1', type: 'wallet', value: 'wallet1', label: 'Wallet 1' },
      { id: '2', type: 'category', value: 'cat2', label: 'Category 2' },
    ]

    const result = mergeFilters(baseFilters, quickFilters)

    expect(result.walletIds).toEqual(['wallet1'])
    expect(result.categoryIds).toEqual(['cat2'])
    expect(result.transactionTypeIds).toEqual(baseFilters.transactionTypeIds)
  })

  it('should preserve period from base filters', () => {
    const quickFilters: QuickFilter[] = [
      { id: '1', type: 'wallet', value: 'wallet1', label: 'Wallet 1' },
    ]

    const result = mergeFilters(baseFilters, quickFilters)

    expect(result.period).toEqual(baseFilters.period)
  })

  it('should add nothing beyond the filters themselves', () => {
    const quickFilters: QuickFilter[] = [
      { id: '1', type: 'wallet', value: 'wallet1', label: 'Wallet 1' },
    ]

    const result = mergeFilters(baseFilters, quickFilters)

    expect(Object.keys(result).sort()).toEqual(Object.keys(baseFilters).sort())
  })

  it('should handle base filters with undefined arrays', () => {
    const minimalBase: TransactionFilters = {}

    const quickFilters: QuickFilter[] = [
      { id: '1', type: 'wallet', value: 'wallet1', label: 'Wallet 1' },
    ]

    const result = mergeFilters(minimalBase, quickFilters)

    expect(result.walletIds).toEqual(['wallet1'])
    expect(result.categoryIds).toBeUndefined()
  })

  it('should handle multiple quick filters of all types', () => {
    const quickFilters: QuickFilter[] = [
      { id: '1', type: 'wallet', value: 'wallet1', label: 'Wallet 1' },
      { id: '2', type: 'wallet', value: 'wallet2', label: 'Wallet 2' },
      { id: '3', type: 'category', value: 'cat1', label: 'Category 1' },
      { id: '4', type: 'category', value: 'cat3', label: 'Category 3' },
      { id: '5', type: 'transactionType', value: 'expense', label: 'Expense' },
    ]

    const result = mergeFilters(baseFilters, quickFilters)

    expect(result.walletIds).toEqual(['wallet1', 'wallet2'])
    expect(result.categoryIds).toEqual(['cat1', 'cat3'])
    expect(result.transactionTypeIds).toEqual(['expense'])
  })
})
