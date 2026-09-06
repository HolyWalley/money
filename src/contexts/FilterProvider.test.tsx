import { act, fireEvent, render, screen } from '@testing-library/react'
import { Suspense, use, useEffect } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { filterPersistence } from '@/lib/filter-persistence'
import { deferred, type Deferred } from '@/lib/suspense'
import { useFilterContext } from './FilterContext'
import { FilterProvider } from './FilterProvider'
import type { Wallet } from '../../shared/schemas/wallet.schema'
import type { Category } from '../../shared/schemas/category.schema'

const wallets = [{ _id: 'w1' }, { _id: 'w2' }] as Wallet[]
const categories = [{ _id: 'c1' }, { _id: 'c2' }] as Category[]

// The rows suspend the way a page's do: on filters other than the ones on
// screen, never on a re-render with the same ones - the pending flag's own
// render is one of those. `pendingRows` is what the next filters wait on.
let shownKey: string | null = null
let pendingRows: Deferred<void>

function Rows() {
  const { effectiveFilters } = useFilterContext()
  const key = JSON.stringify(effectiveFilters)
  if (shownKey !== null && key !== shownKey) {
    use(pendingRows.promise)
  }
  useEffect(() => {
    shownKey = key
  })
  const { walletIds, categoryIds, transactionTypeIds } = effectiveFilters
  return (
    <div data-testid="rows">
      {[walletIds, categoryIds, transactionTypeIds].map(ids => ids?.join(' ')).join(' | ')}
    </div>
  )
}

function Controls() {
  const {
    isPending,
    hasUnsavedChanges,
    updateBaseFilters,
    resetBaseFilters,
    clearQuickFilters,
    toggleQuickFilter,
    setQuickFiltersForType,
    saveBaseFilters,
  } = useFilterContext()

  return (
    <div>
      <output data-testid="pending">{String(isPending)}</output>
      <output data-testid="unsaved">{String(hasUnsavedChanges)}</output>
      <button onClick={() => updateBaseFilters({ walletIds: ['w2'] })}>update</button>
      <button onClick={resetBaseFilters}>reset</button>
      <button onClick={clearQuickFilters}>clear quick</button>
      <button onClick={() => toggleQuickFilter({ type: 'category', value: 'c2', label: 'C2' })}>
        toggle quick
      </button>
      <button onClick={() => setQuickFiltersForType('transactionType', [{ value: 'expense', label: 'Expense' }])}>
        set quick type
      </button>
      <button onClick={saveBaseFilters}>save</button>
    </div>
  )
}

function mount() {
  render(
    <FilterProvider page="overview" wallets={wallets} categories={categories}>
      <Controls />
      <Suspense fallback={<div data-testid="fallback" />}>
        <Rows />
      </Suspense>
    </FilterProvider>
  )
}

const rows = () => screen.getByTestId('rows')
const pending = () => screen.getByTestId('pending')

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

// The old rows stay up and nothing falls back while the new ones are on their
// way; only the pending flag says something is happening.
async function expectTransition(name: string, from: string, to: string) {
  pendingRows = deferred<void>()

  await click(name)

  expect(rows()).toHaveTextContent(from)
  expect(rows()).toBeVisible()
  expect(pending()).toHaveTextContent('true')
  expect(screen.queryByTestId('fallback')).not.toBeInTheDocument()

  await act(async () => pendingRows.resolve())

  expect(rows()).toHaveTextContent(to)
  expect(pending()).toHaveTextContent('false')
}

describe('FilterProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    shownKey = null
    // Answered already, so a test that is not about the transition sees its
    // change land at once.
    pendingRows = deferred<void>()
    pendingRows.resolve()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts from the persisted filters without waiting', () => {
    filterPersistence.saveFilters('overview', {
      walletIds: ['w2'],
      categoryIds: ['c1'],
      transactionTypeIds: ['expense'],
      period: { type: 'monthly', currentPeriod: 0, monthDay: 1 },
    })

    mount()

    expect(rows()).toHaveTextContent('w2 | c1 | expense')
    expect(pending()).toHaveTextContent('false')
    expect(screen.getByTestId('unsaved')).toHaveTextContent('false')
  })

  it('starts from every wallet and category when nothing is persisted', () => {
    mount()

    expect(rows()).toHaveTextContent('w1 w2 | c1 c2 | income expense transfer')
  })

  describe('runs every setter inside a transition', () => {
    it('updateBaseFilters', async () => {
      mount()
      await expectTransition('update', 'w1 w2 | c1 c2', 'w2 | c1 c2')
    })

    it('resetBaseFilters', async () => {
      mount()
      await expectTransition('update', 'w1 w2 |', 'w2 |')
      await expectTransition('reset', 'w2 |', 'w1 w2 |')
    })

    it('toggleQuickFilter', async () => {
      mount()
      await expectTransition('toggle quick', '| c1 c2 |', '| c2 |')
    })

    it('setQuickFiltersForType', async () => {
      mount()
      await expectTransition('set quick type', '| income expense transfer', '| expense')
    })

    it('clearQuickFilters', async () => {
      mount()
      await expectTransition('toggle quick', '| c1 c2 |', '| c2 |')
      await expectTransition('clear quick', '| c2 |', '| c1 c2 |')
    })
  })

  it('persists a changed base filter after the debounce', async () => {
    vi.useFakeTimers()
    mount()

    await click('update')
    expect(screen.getByTestId('unsaved')).toHaveTextContent('true')
    expect(filterPersistence.loadFilters('overview')).toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(filterPersistence.loadFilters('overview')?.walletIds).toEqual(['w2'])
    expect(screen.getByTestId('unsaved')).toHaveTextContent('false')
  })

  it('saves at once when asked to', async () => {
    mount()

    await click('update')
    await click('save')

    expect(filterPersistence.loadFilters('overview')?.walletIds).toEqual(['w2'])
    expect(screen.getByTestId('unsaved')).toHaveTextContent('false')
  })
})
