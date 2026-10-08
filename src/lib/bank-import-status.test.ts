import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/services/bankImportService', () => ({
  bankImportService: { fetchOperations: vi.fn(() => Promise.resolve({ ok: false, error: 'x' })) },
}))

import { bankImportService } from '@/services/bankImportService'
import {
  closeBankImport,
  getBankImportStatus,
  openBankImport,
  resetBankImportStatus,
  setPendingBankOperations,
  subscribeBankImportStatus,
} from './bank-import-status'

describe('bank import status', () => {
  beforeEach(() => {
    resetBankImportStatus()
    vi.clearAllMocks()
  })

  it('tells subscribers when the pending count changes, and only then', () => {
    const listener = vi.fn()
    subscribeBankImportStatus(listener)

    setPendingBankOperations(3)
    setPendingBankOperations(3)

    expect(getBankImportStatus().pending).toBe(3)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('opens the import with a fresh fetch and closes it', () => {
    openBankImport()

    expect(bankImportService.fetchOperations).toHaveBeenCalledTimes(1)
    expect(getBankImportStatus().request).toBeInstanceOf(Promise)

    closeBankImport()

    expect(getBankImportStatus().request).toBeNull()
  })

  it('stops telling a listener that unsubscribed', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeBankImportStatus(listener)

    unsubscribe()
    setPendingBankOperations(1)

    expect(listener).not.toHaveBeenCalled()
  })
})
