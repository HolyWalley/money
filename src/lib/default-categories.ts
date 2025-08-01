import type { Category, CategoryColor } from '../../shared/schemas/category.schema'

interface DefaultCategoryTemplate {
  _id: string
  name: string
  icon: string
  color: CategoryColor
}

export const defaultIncomeCategories: DefaultCategoryTemplate[] = [
  {
    _id: 'default-income-salary',
    name: 'Income',
    icon: 'Wallet',
    color: 'green'
  }
]

export const defaultTransferCategories: DefaultCategoryTemplate[] = [
  {
    _id: 'default-transfer-misc',
    name: 'Misc',
    icon: 'Shapes',
    color: 'gray'
  },
  {
    _id: 'default-transfer-savings',
    name: 'Savings',
    icon: 'PiggyBank',
    color: 'blue'
  },
]

export const defaultExpenseCategories: DefaultCategoryTemplate[] = [
  {
    _id: 'default-expense-entertainment',
    name: 'Entertainment',
    icon: 'Music',
    color: 'purple'
  },
  {
    _id: 'default-expense-fees',
    name: 'Fees',
    icon: 'Receipt',
    color: 'red'
  },
  {
    _id: 'default-expense-food',
    name: 'Food & Drink',
    icon: 'Utensils',
    color: 'orange'
  },
  {
    _id: 'default-expense-groceries',
    name: 'Groceries',
    icon: 'ShoppingCart',
    color: 'green'
  },
  {
    _id: 'default-expense-gifts',
    name: 'Gift & Donations',
    icon: 'Gift',
    color: 'pink'
  },
  {
    _id: 'default-expense-health',
    name: 'Health',
    icon: 'Heart',
    color: 'red'
  },
  {
    _id: 'default-expense-home',
    name: 'Home',
    icon: 'Home',
    color: 'blue'
  },
  {
    _id: 'default-expense-pet',
    name: 'Pet',
    icon: 'Cat',
    color: 'orange'
  },
  {
    _id: 'default-expense-loans',
    name: 'Loans',
    icon: 'Banknote',
    color: 'gray'
  },
  {
    _id: 'default-expense-utilities',
    name: 'Rent & Utilities',
    icon: 'Building',
    color: 'yellow'
  },
  {
    _id: 'default-expense-services',
    name: 'Services',
    icon: 'Briefcase',
    color: 'blue'
  },
  {
    _id: 'default-expense-shopping',
    name: 'Shopping',
    icon: 'ShoppingBag',
    color: 'purple'
  },
  {
    _id: 'default-expense-transport',
    name: 'Transportation',
    icon: 'Car',
    color: 'green'
  },
  {
    _id: 'default-expense-travel',
    name: 'Travel',
    icon: 'Plane',
    color: 'blue'
  }
]

export function createDefaultCategories(): Category[] {
  const now = new Date().toISOString()
  const categories: Category[] = []

  defaultIncomeCategories.forEach((cat, index) => {
    categories.push({
      _id: cat._id,
      name: cat.name,
      type: 'income',
      icon: cat.icon,
      color: cat.color,
      isDefault: true,
      order: index,
      createdAt: now,
      updatedAt: now
    })
  })

  defaultTransferCategories.forEach((cat, index) => {
    categories.push({
      _id: cat._id,
      name: cat.name,
      type: 'transfer',
      icon: cat.icon,
      color: cat.color,
      isDefault: true,
      order: index,
      createdAt: now,
      updatedAt: now
    })
  })

  defaultExpenseCategories.forEach((cat, index) => {
    categories.push({
      _id: cat._id,
      name: cat.name,
      type: 'expense',
      icon: cat.icon,
      color: cat.color,
      isDefault: true,
      order: index,
      createdAt: now,
      updatedAt: now
    })
  })

  return categories
}
