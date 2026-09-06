import { act, render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { deferred, type Deferred } from '@/lib/suspense'
import { CategoriesDialog } from './CategoriesDialog'
import type { Category } from '../../../shared/schemas/category.schema'

const mocks = vi.hoisted(() => ({
  categories: null as unknown as { promise: Promise<Category[]> },
}))

// Reads the way the real hook does: suspends until the store answers.
vi.mock('@/hooks/useLiveCategories', async () => {
  const { use } = await import('react')
  return { useLiveCategories: () => use(mocks.categories.promise) }
})

vi.mock('@/lib/crdts', () => ({ addCategory: vi.fn() }))
// jsdom has no Element.getAnimations, which the scroll area polls for.
vi.mock('../ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/services/categoryService', () => ({ categoryService: {} }))

vi.mock('./CategoryList', () => ({
  CategoryList: ({ title, categories }: { title: string; categories: Category[] }) => (
    <div>{`${title}: ${categories.length}`}</div>
  ),
}))

let categories: Deferred<Category[]>

describe('CategoriesDialog', () => {
  beforeEach(() => {
    categories = deferred<Category[]>()
    mocks.categories = categories
  })

  it('opens at once and spins until the categories answer', async () => {
    await act(async () => {
      render(<CategoriesDialog open onOpenChange={vi.fn()} />)
    })

    expect(screen.getByText('Categories')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    expect(screen.queryByText(/Income/)).not.toBeInTheDocument()

    await act(async () => {
      categories.resolve([{ _id: 'c1', name: 'Salary', type: 'income', order: 0 } as Category])
    })

    expect(screen.getByText('Income: 1')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows a failed read inside the dialog', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    categories.reject(new Error('index missing'))

    await act(async () => {
      render(<CategoriesDialog open onOpenChange={vi.fn()} />)
    })

    expect(screen.getByText('Categories')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('This could not be read')
    consoleError.mockRestore()
  })
})
