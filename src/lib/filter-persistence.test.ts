import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FilterPersistenceService } from './filter-persistence'
import type { TransactionFilters } from '@/hooks/useLiveTransactions'

describe('FilterPersistenceService', () => {
  let service: FilterPersistenceService
  let mockStorage: Record<string, string>

  beforeEach(() => {
    mockStorage = {}

    global.localStorage = {
      getItem: vi.fn((key: string) => mockStorage[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        mockStorage[key] = value
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key]
      }),
      clear: vi.fn(() => {
        mockStorage = {}
      }),
      length: 0,
      key: vi.fn(() => null),
    }

    service = new FilterPersistenceService()
  })

  describe('saveFilters', () => {
    it('should save filters for a specific page', () => {
      const filters: TransactionFilters = {
        categoryIds: ['cat1', 'cat2'],
        walletIds: ['wallet1'],
        transactionTypeIds: ['expense'],
        period: {
          type: 'monthly',
          currentPeriod: 0,
          monthDay: 1,
        },
      }

      service.saveFilters('overview', filters)

      const stored = JSON.parse(mockStorage['money:filters'])
      expect(stored.overview).toEqual(filters)
      expect(stored.version).toBe('1')
    })

    it('should preserve filters for other pages', () => {
      const overviewFilters: TransactionFilters = {
        categoryIds: ['cat1'],
      }
      const transactionsFilters: TransactionFilters = {
        walletIds: ['wallet1'],
      }

      service.saveFilters('overview', overviewFilters)
      service.saveFilters('transactions', transactionsFilters)

      const stored = JSON.parse(mockStorage['money:filters'])
      expect(stored.overview).toEqual(overviewFilters)
      expect(stored.transactions).toEqual(transactionsFilters)
    })

    it('should update lastUpdated timestamp', () => {
      const filters: TransactionFilters = { categoryIds: ['cat1'] }
      const before = new Date().toISOString()

      service.saveFilters('overview', filters)

      const stored = JSON.parse(mockStorage['money:filters'])
      const after = new Date().toISOString()

      expect(stored.lastUpdated).toBeDefined()
      expect(stored.lastUpdated >= before).toBe(true)
      expect(stored.lastUpdated <= after).toBe(true)
    })
  })

  describe('loadFilters', () => {
    it('should load filters for a specific page', () => {
      const filters: TransactionFilters = {
        categoryIds: ['cat1'],
      }

      service.saveFilters('overview', filters)
      const loaded = service.loadFilters('overview')

      expect(loaded).toEqual(filters)
    })

    it('should return null if no filters saved for page', () => {
      const loaded = service.loadFilters('overview')
      expect(loaded).toBeNull()
    })

    it('should return null if storage is empty', () => {
      const loaded = service.loadFilters('transactions')
      expect(loaded).toBeNull()
    })

    it('should handle corrupted storage gracefully', () => {
      mockStorage['money:filters'] = 'invalid json'
      const loaded = service.loadFilters('overview')
      expect(loaded).toBeNull()
    })

    // Filters saved before reads suspended carried a loading flag and a
    // version stamp; they must not come back as filters.
    it('drops the loading flag and version stamp an older save carries', () => {
      mockStorage['money:filters'] = JSON.stringify({
        overview: {
          isLoading: false,
          filterVersion: '1700000000000',
          categoryIds: ['cat1'],
          period: { type: 'monthly', currentPeriod: 0, monthDay: 1 },
        },
        transactions: null,
        lastUpdated: new Date().toISOString(),
        version: '1',
      })

      const loaded = service.loadFilters('overview')

      expect(loaded).toEqual({
        categoryIds: ['cat1'],
        period: { type: 'monthly', currentPeriod: 0, monthDay: 1 },
      })
      expect(loaded).not.toHaveProperty('isLoading')
      expect(loaded).not.toHaveProperty('filterVersion')
    })
  })

  describe('clearAll', () => {
    it('should remove all stored filters', () => {
      service.saveFilters('overview', { categoryIds: ['cat1'] })
      service.saveFilters('transactions', { walletIds: ['wallet1'] })

      service.clearAll()

      expect(mockStorage['money:filters']).toBeUndefined()
    })

    it('should not throw if storage is already empty', () => {
      expect(() => service.clearAll()).not.toThrow()
    })
  })

  describe('clearPage', () => {
    it('should clear filters for specific page', () => {
      service.saveFilters('overview', { categoryIds: ['cat1'] })
      service.saveFilters('transactions', { walletIds: ['wallet1'] })

      service.clearPage('overview')

      const loaded = service.loadFilters('overview')
      expect(loaded).toBeNull()

      const transactionsLoaded = service.loadFilters('transactions')
      expect(transactionsLoaded).toBeDefined()
    })

    it('should not throw if page has no filters', () => {
      expect(() => service.clearPage('overview')).not.toThrow()
    })
  })

  describe('hasSavedFilters', () => {
    it('should return true if filters exist for page', () => {
      service.saveFilters('overview', { categoryIds: ['cat1'] })
      expect(service.hasSavedFilters('overview')).toBe(true)
    })

    it('should return false if no filters for page', () => {
      expect(service.hasSavedFilters('overview')).toBe(false)
    })

    it('should return false after clearing page', () => {
      service.saveFilters('overview', { categoryIds: ['cat1'] })
      service.clearPage('overview')
      expect(service.hasSavedFilters('overview')).toBe(false)
    })
  })

  describe('version handling', () => {
    it('should clear storage if version mismatch', () => {
      mockStorage['money:filters'] = JSON.stringify({
        overview: { categoryIds: ['cat1'] },
        transactions: null,
        lastUpdated: new Date().toISOString(),
        version: '0',
      })

      const loaded = service.loadFilters('overview')
      expect(loaded).toBeNull()
      expect(mockStorage['money:filters']).toBeUndefined()
    })
  })
})
