import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const { crdtReadyControl, mockReconcileLinkedGoals, mockAddCategoryWithId, mockUseLiveCategories } =
  vi.hoisted(() => {
    let release: () => void = () => {}
    const promise = new Promise<void>(resolve => {
      release = resolve
    })
    return {
      crdtReadyControl: { promise, release: () => release() },
      mockReconcileLinkedGoals: vi.fn(),
      mockAddCategoryWithId: vi.fn(),
      mockUseLiveCategories: vi.fn(),
    }
  })

vi.mock('@/lib/crdts', () => ({
  crdtReady: crdtReadyControl.promise,
  addCategoryWithId: (...args: unknown[]) => mockAddCategoryWithId(...args),
}))

vi.mock('@/services/recurringGoalLinker', () => ({
  reconcileLinkedGoals: () => mockReconcileLinkedGoals(),
}))

vi.mock('@/hooks/useLiveCategories', () => ({
  useLiveCategories: () => mockUseLiveCategories(),
}))

vi.mock('@/lib/default-categories', () => ({
  createDefaultCategories: () => [],
}))

import { useAppInitialization } from './useAppInitialization'

beforeEach(() => {
  mockReconcileLinkedGoals.mockClear()
  mockAddCategoryWithId.mockClear()
  mockUseLiveCategories.mockReturnValue({ categories: [{ _id: 'c1' }], isLoading: false })
})

describe('useAppInitialization', () => {
  // The ordering guard. Reconciling detaches any goal whose recurring payment
  // is missing, and before crdtReady resolves the document is empty — so
  // running early would silently detach every linked goal in the account.
  it('does not reconcile linked goals until the CRDT has loaded', async () => {
    renderHook(() => useAppInitialization())

    // Give any un-awaited microtask chain a chance to run.
    await Promise.resolve()
    await Promise.resolve()
    expect(mockReconcileLinkedGoals).not.toHaveBeenCalled()

    crdtReadyControl.release()

    await waitFor(() => expect(mockReconcileLinkedGoals).toHaveBeenCalledTimes(1))
  })

  it('reconciles once, not on every render', async () => {
    const { rerender } = renderHook(() => useAppInitialization())
    await waitFor(() => expect(mockReconcileLinkedGoals).toHaveBeenCalledTimes(1))

    rerender()
    rerender()

    await Promise.resolve()
    expect(mockReconcileLinkedGoals).toHaveBeenCalledTimes(1)
  })

  it('survives a reconcile that throws without breaking the app', async () => {
    mockReconcileLinkedGoals.mockImplementation(() => {
      throw new Error('dexie exploded')
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => useAppInitialization())).not.toThrow()

    await waitFor(() => expect(consoleError).toHaveBeenCalled())
    consoleError.mockRestore()
  })
})
