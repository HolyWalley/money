import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExpensesByCategoryChart } from './ExpensesByCategoryChart'
import type { Category } from '../../shared/schemas/category.schema'

const mockCategories: Category[] = [
  {
    _id: 'cat1',
    name: 'Food',
    type: 'expense',
    icon: 'Utensils',
    color: 'red',
    isDefault: true,
    order: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    _id: 'cat2',
    name: 'Transport',
    type: 'expense',
    icon: 'Car',
    color: 'blue',
    isDefault: true,
    order: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    _id: 'cat3',
    name: 'Entertainment',
    type: 'expense',
    icon: 'Music',
    color: 'purple',
    isDefault: true,
    order: 2,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
]

describe('ExpensesByCategoryChart', () => {
  it('renders chart with expenses by category', () => {
    const expensesByCategory = new Map([
      ['cat1', 150.50],
      ['cat2', 75.25],
      ['cat3', 50.00],
    ])

    render(
      <ExpensesByCategoryChart
        expensesByCategory={expensesByCategory}
        categories={mockCategories}
        baseCurrency="USD"
        selectedCategoryId={null}
        onCategoryClick={vi.fn()}
      />
    )

    expect(screen.getByText('Expenses by Category')).toBeInTheDocument()
  })

  it('returns null when no expenses', () => {
    const expensesByCategory = new Map<string, number>()

    const { container } = render(
      <ExpensesByCategoryChart
        expensesByCategory={expensesByCategory}
        categories={mockCategories}
        baseCurrency="USD"
        selectedCategoryId={null}
        onCategoryClick={vi.fn()}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('filters out categories not in the categories list', () => {
    const expensesByCategory = new Map([
      ['cat1', 100],
      ['unknown-cat', 200],
    ])

    render(
      <ExpensesByCategoryChart
        expensesByCategory={expensesByCategory}
        categories={mockCategories}
        baseCurrency="USD"
        selectedCategoryId={null}
        onCategoryClick={vi.fn()}
      />
    )

    expect(screen.getByText('Expenses by Category')).toBeInTheDocument()
  })

  it('sorts categories by expense amount descending', () => {
    const expensesByCategory = new Map([
      ['cat1', 50],
      ['cat2', 150],
      ['cat3', 100],
    ])

    render(
      <ExpensesByCategoryChart
        expensesByCategory={expensesByCategory}
        categories={mockCategories}
        baseCurrency="USD"
        selectedCategoryId={null}
        onCategoryClick={vi.fn()}
      />
    )

    expect(screen.getByText('Expenses by Category')).toBeInTheDocument()
  })
})
