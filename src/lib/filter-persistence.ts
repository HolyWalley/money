import type { TransactionFilters } from '@/hooks/useLiveTransactions'

const STORAGE_KEY = 'money:filters'
const STORAGE_VERSION = '1'

export interface StoredFilters {
  overview: TransactionFilters | null
  transactions: TransactionFilters | null
  lastUpdated: string
  version: string
}

export type FilterPage = 'overview' | 'transactions'

export class FilterPersistenceService {
  private getStorage(): StoredFilters | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return null

      const parsed = JSON.parse(stored) as StoredFilters

      if (parsed.version !== STORAGE_VERSION) {
        console.warn('Filter storage version mismatch, clearing storage')
        this.clearAll()
        return null
      }

      return parsed
    } catch (error) {
      console.error('Failed to read filter storage:', error)
      return null
    }
  }

  private setStorage(data: StoredFilters): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('Failed to write filter storage:', error)
    }
  }

  saveFilters(page: FilterPage, filters: TransactionFilters): void {
    const storage = this.getStorage() || {
      overview: null,
      transactions: null,
      lastUpdated: new Date().toISOString(),
      version: STORAGE_VERSION,
    }

    storage[page] = filters
    storage.lastUpdated = new Date().toISOString()
    this.setStorage(storage)
  }

  loadFilters(page: FilterPage): TransactionFilters | null {
    const storage = this.getStorage()
    return storage?.[page] || null
  }

  clearAll(): void {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (error) {
      console.error('Failed to clear filter storage:', error)
    }
  }

  clearPage(page: FilterPage): void {
    const storage = this.getStorage()
    if (!storage) return

    storage[page] = null
    storage.lastUpdated = new Date().toISOString()
    this.setStorage(storage)
  }

  hasSavedFilters(page: FilterPage): boolean {
    const storage = this.getStorage()
    return storage?.[page] !== null && storage?.[page] !== undefined
  }
}

export const filterPersistence = new FilterPersistenceService()
