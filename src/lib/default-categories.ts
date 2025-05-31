import type { Category, CategoryColor } from '../../shared/schemas/category.schema'

interface DefaultCategoryTemplate {
  name: string
  icon: string
  color: CategoryColor
}

export const defaultIncomeCategories: DefaultCategoryTemplate[] = [
  {
    name: 'Income',
    icon: 'Wallet',
    color: 'green'
  }
]

export const defaultExpenseCategories: DefaultCategoryTemplate[] = [
  {
    name: 'Entertainment',
    icon: 'Music',
    color: 'purple'
  },
  {
    name: 'Fees',
    icon: 'Receipt',
    color: 'red'
  },
  {
    name: 'Food & Drink',
    icon: 'Utensils',
    color: 'orange'
  },
  {
    name: 'Gift & Donations',
    icon: 'Gift',
    color: 'pink'
  },
  {
    name: 'Health',
    icon: 'Heart',
    color: 'red'
  },
  {
    name: 'Home',
    icon: 'Home',
    color: 'blue'
  },
  {
    name: 'Loans',
    icon: 'Banknote',
    color: 'gray'
  },
  {
    name: 'Rent & Utilities',
    icon: 'Building',
    color: 'yellow'
  },
  {
    name: 'Services',
    icon: 'Briefcase',
    color: 'blue'
  },
  {
    name: 'Shopping',
    icon: 'ShoppingBag',
    color: 'purple'
  },
  {
    name: 'Transportation',
    icon: 'Car',
    color: 'green'
  },
  {
    name: 'Travel',
    icon: 'Plane',
    color: 'blue'
  }
]

export function createDefaultCategories(userId: string): Omit<Category, '_id'>[] {
  const now = new Date().toISOString()
  const categories: Omit<Category, '_id'>[] = []

  defaultIncomeCategories.forEach((cat, index) => {
    categories.push({
      name: cat.name,
      type: 'income',
      icon: cat.icon,
      color: cat.color,
      isDefault: true,
      order: index,
      userId,
      createdAt: now,
      updatedAt: now
    })
  })

  defaultExpenseCategories.forEach((cat, index) => {
    categories.push({
      name: cat.name,
      type: 'expense',
      icon: cat.icon,
      color: cat.color,
      isDefault: true,
      order: index,
      userId,
      createdAt: now,
      updatedAt: now
    })
  })

  return categories
}
