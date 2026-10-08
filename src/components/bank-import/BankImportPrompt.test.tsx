import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }))
vi.mock('@/lib/document-ready', () => ({ documentReady: Promise.resolve() }))
vi.mock('@/services/bankImportService', () => ({
  bankImportService: { countPending: vi.fn(), fetchOperations: vi.fn(() => new Promise(() => {})) },
}))
vi.mock('./BankImportDrawer', () => ({
  BankImportDrawer: ({ request }: { request: Promise<unknown> | null }) => (request ? <p>drawer open</p> : null),
}))

import { toast } from 'sonner'
import { bankImportService } from '@/services/bankImportService'
import { getBankImportStatus, resetBankImportStatus } from '@/lib/bank-import-status'
import { BANK_IMPORT_CHECK_INTERVAL_MS, BankImportPrompt } from './BankImportPrompt'

const countPending = vi.mocked(bankImportService.countPending)

async function mount() {
  await act(async () => {
    render(<BankImportPrompt />)
  })
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

type ToastOptions = { id: string; action: { label: string; onClick: () => void } }

describe('BankImportPrompt', () => {
  beforeEach(() => {
    resetBankImportStatus()
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('says how many operations are waiting, with a way to review them', async () => {
    countPending.mockResolvedValue(3)

    await mount()

    expect(getBankImportStatus().pending).toBe(3)
    expect(toast).toHaveBeenCalledWith('3 new bank operations', expect.objectContaining({ id: 'bank-import' }))
    const options = vi.mocked(toast).mock.calls[0][1] as unknown as ToastOptions
    expect(options.action.label).toBe('Review')

    await act(async () => options.action.onClick())

    expect(screen.getByText('drawer open')).toBeInTheDocument()
    expect(toast.dismiss).toHaveBeenCalledWith('bank-import')
  })

  it('says nothing while there is nothing to review', async () => {
    countPending.mockResolvedValue(0)

    await mount()

    expect(toast).not.toHaveBeenCalled()
  })

  it('does not repeat itself for the same operations, but speaks up for new ones', async () => {
    countPending.mockResolvedValue(1)
    await mount()
    expect(toast).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenLastCalledWith('1 new bank operation', expect.anything())

    await advance(BANK_IMPORT_CHECK_INTERVAL_MS)
    expect(toast).toHaveBeenCalledTimes(1)

    countPending.mockResolvedValue(2)
    await advance(BANK_IMPORT_CHECK_INTERVAL_MS)
    expect(toast).toHaveBeenCalledTimes(2)
  })

  it('keeps the last count when the inbox cannot be read', async () => {
    countPending.mockResolvedValueOnce(2).mockResolvedValue(null)
    await mount()

    await advance(BANK_IMPORT_CHECK_INTERVAL_MS)

    expect(getBankImportStatus().pending).toBe(2)
  })

  it('checks again on coming back online', async () => {
    countPending.mockResolvedValue(0)
    await mount()

    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })

    expect(countPending).toHaveBeenCalledTimes(2)
  })
})
