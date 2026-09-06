import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import * as Y from 'yjs'
import { awaitRestoredData, endRestore } from '@/lib/pending-restore'

const { crdtReadyControl, mockReconcileLinkedGoals, mockAddCategoryWithId, mockWarmStores } =
  vi.hoisted(() => {
    let release: () => void = () => {}
    const promise = new Promise<void>(resolve => {
      release = resolve
    })
    return {
      crdtReadyControl: { promise, release: () => release() },
      mockReconcileLinkedGoals: vi.fn(),
      mockAddCategoryWithId: vi.fn(),
      mockWarmStores: vi.fn(() => Promise.resolve()),
    }
  })

// The document's own map, so the hook reads what an account holds without a
// hook that would suspend above the page boundary.
vi.mock('@/lib/crdts', async () => {
  const { Doc } = await import('yjs')
  return {
    crdtReady: crdtReadyControl.promise,
    categories: new Doc().getMap('categories'),
    addCategoryWithId: (...args: unknown[]) => mockAddCategoryWithId(...args),
  }
})

vi.mock('@/services/recurringGoalLinker', () => ({
  reconcileLinkedGoals: () => mockReconcileLinkedGoals(),
}))

vi.mock('@/lib/default-categories', () => ({
  createDefaultCategories: () => [{ _id: 'default-1', name: 'Groceries' }],
}))

vi.mock('./warmStores', () => ({
  warmStores: () => mockWarmStores(),
}))

import { categories } from '@/lib/crdts'
import { useAppInitialization } from './useAppInitialization'

beforeEach(() => {
  mockReconcileLinkedGoals.mockClear()
  mockAddCategoryWithId.mockClear()
  mockWarmStores.mockClear()
  categories.clear()
  categories.set('c1', new Y.Map())
  endRestore()
})

describe('useAppInitialization', () => {
  // The ordering guard. Reconciling detaches any goal whose recurring payment
  // is missing, and before the document has loaded it is empty — so running
  // early would silently detach every linked goal in the account.
  it('does not reconcile linked goals until the document has loaded', async () => {
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
    categories.clear()

    renderHook(() => useAppInitialization())

    await waitFor(() => expect(mockAddCategoryWithId).toHaveBeenCalledTimes(1))
    expect(mockAddCategoryWithId).toHaveBeenCalledWith({ _id: 'default-1', name: 'Groceries' })
  })

  it('leaves an account that already has categories alone', async () => {
    renderHook(() => useAppInitialization())

    await Promise.resolve()
    await Promise.resolve()
    expect(mockAddCategoryWithId).not.toHaveBeenCalled()
  })

  // An import throws the local data away and waits for the server's copy. An
  // empty document in that window is not a new account, and categories invented
  // here would merge with the ones the pull is about to deliver.
  it('does not seed defaults while a restore is pending', async () => {
    awaitRestoredData()
    categories.clear()

    renderHook(() => useAppInitialization())

    await Promise.resolve()
    await Promise.resolve()
    expect(mockAddCategoryWithId).not.toHaveBeenCalled()
  })

  // The dump may genuinely have carried no categories, so seeding has to be
  // reconsidered the moment the replacement lands rather than skipped for good.
  it('seeds once the replacement data has arrived and brought nothing', async () => {
    awaitRestoredData()
    categories.clear()

    renderHook(() => useAppInitialization())
    await Promise.resolve()
    await Promise.resolve()
    expect(mockAddCategoryWithId).not.toHaveBeenCalled()

    act(() => endRestore())

    await waitFor(() => expect(mockAddCategoryWithId).toHaveBeenCalledTimes(1))
  })

  it('warms every store once, not on every render', async () => {
    const { rerender } = renderHook(() => useAppInitialization())

    expect(mockWarmStores).toHaveBeenCalledTimes(1)

    rerender()
    expect(mockWarmStores).toHaveBeenCalledTimes(1)
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
