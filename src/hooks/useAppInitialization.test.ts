import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { awaitRestoredData, endRestore } from '@/lib/pending-restore'

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
  createDefaultCategories: () => [{ _id: 'default-1', name: 'Groceries' }],
}))

import { useAppInitialization } from './useAppInitialization'

beforeEach(() => {
  mockReconcileLinkedGoals.mockClear()
  mockAddCategoryWithId.mockClear()
  mockUseLiveCategories.mockReturnValue({ categories: [{ _id: 'c1' }], isLoading: false })
  endRestore()
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

  it('seeds default categories into an account that has none', async () => {
    mockUseLiveCategories.mockReturnValue({ categories: [], isLoading: false })

    renderHook(() => useAppInitialization())

    await waitFor(() => expect(mockAddCategoryWithId).toHaveBeenCalledTimes(1))
  })

  it('leaves an account that already has categories alone', async () => {
    renderHook(() => useAppInitialization())

    await Promise.resolve()
    expect(mockAddCategoryWithId).not.toHaveBeenCalled()
  })

  // An import throws the local data away and waits for the server's copy. An
  // empty document in that window is not a new account, and categories invented
  // here would merge with the ones the pull is about to deliver.
  it('does not seed defaults while a restore is pending', async () => {
    awaitRestoredData()
    mockUseLiveCategories.mockReturnValue({ categories: [], isLoading: false })

    renderHook(() => useAppInitialization())

    await Promise.resolve()
    await Promise.resolve()
    expect(mockAddCategoryWithId).not.toHaveBeenCalled()
  })

  // The dump may genuinely have carried no categories, so seeding has to be
  // reconsidered the moment the replacement lands rather than skipped for good.
  it('seeds once the replacement data has arrived and brought nothing', async () => {
    awaitRestoredData()
    mockUseLiveCategories.mockReturnValue({ categories: [], isLoading: false })

    renderHook(() => useAppInitialization())
    expect(mockAddCategoryWithId).not.toHaveBeenCalled()

    act(() => endRestore())

    await waitFor(() => expect(mockAddCategoryWithId).toHaveBeenCalledTimes(1))
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
