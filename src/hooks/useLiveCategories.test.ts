import { act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { UTCDate } from '@date-fns/utc'
import { db } from '@/lib/db-dexie'
import { resetSharedLiveQueries } from '@/lib/shared-live-query'
import { renderHookSuspended } from '@/test/suspense'
import { categoriesStore, useLiveCategories } from './useLiveCategories'
import type { CategoryType } from '../../shared/schemas/category.schema'

const now = new UTCDate('2026-09-06T00:00:00.000Z')

function category(id: string, type: CategoryType, order: number) {
  return {
    _id: id,
    name: id,
    type,
    icon: 'tag',
    color: 'blue' as const,
    isDefault: false,
    order,
    createdAt: now,
    updatedAt: now,
  }
}

const ids = (categories: { _id: string }[]) => categories.map(c => c._id)

describe('useLiveCategories', () => {
  beforeEach(async () => {
    resetSharedLiveQueries()
    await db.categories.clear()
    await db.categories.bulkAdd([
      category('groceries', 'expense', 2),
      category('salary', 'income', 0),
      category('rent', 'expense', 0),
      category('savings', 'transfer', 1),
      category('fun', 'expense', 1),
    ])
  })

  it('answers a type in the order the keyed query used to give', async () => {
    const { result } = await renderHookSuspended(() => useLiveCategories('expense'))
    await waitFor(() => expect(result.current).toHaveLength(3))

    const keyed = await db.categories.where('type').equals('expense').sortBy('order')
    expect(ids(result.current)).toEqual(ids(keyed))
    expect(ids(result.current)).toEqual(['rent', 'fun', 'groceries'])
  })

  it('answers every category by order, as the store holds them, when no type is asked', async () => {
    const { result } = await renderHookSuspended(() => useLiveCategories())
    await waitFor(() => expect(result.current).toHaveLength(5))

    expect(ids(result.current)).toEqual(['rent', 'salary', 'fun', 'savings', 'groceries'])
    expect(result.current).toBe(categoriesStore.peek())
    expect(result.current[0].createdAt).toBe('2026-09-06T00:00:00.000Z')
  })

  it('keeps the subset identity across renders and follows a write', async () => {
    const { result, rerender } = await renderHookSuspended(() => useLiveCategories('income'))
    await waitFor(() => expect(ids(result.current)).toEqual(['salary']))

    const before = result.current
    rerender()
    expect(result.current).toBe(before)

    await act(async () => {
      await db.categories.add(category('bonus', 'income', 1))
    })

    await waitFor(() => expect(ids(result.current)).toEqual(['salary', 'bonus']))
  })
})
