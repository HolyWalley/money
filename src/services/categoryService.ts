import type { Category } from '../../shared/schemas/category.schema'
import * as Y from 'yjs'
import { ydoc, categories } from '../lib/crdts'

// Helper function to create properly typed Y.Map for categories with safe type assertion
function createCategoryMap(data: Omit<Category, '_id'> & { _id: string }): Y.Map<Category> {
  const entries = Object.entries(data) as [string, unknown][]
  return new Y.Map(entries) as unknown as Y.Map<Category>
}

import { v4 as uuid } from 'uuid'

class CategoryService {
  createCategory(categoryData: Omit<Category, '_id' | 'createdAt' | 'updatedAt'>): string {
    try {
      const { name, type, icon, color, isDefault, order, userId } = categoryData
      const id = uuid()
      ydoc.transact(() => {
        categories.set(id, createCategoryMap({
          _id: id,
          name,
          type,
          icon,
          color,
          isDefault,
          order,
          userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }))
      })
      return id
    } catch (error) {
      console.error('Error creating category:', error)
      throw error
    }
  }

  updateCategory(id: string, updates: Partial<Category>): void {
    try {
      ydoc.transact(() => {
        const category = categories.get(id)
        if (!category) return
        categories.set(id, createCategoryMap({
          _id: id,
          name: updates.name ?? (category.get('name') as unknown as string),
          type: updates.type ?? (category.get('type') as unknown as Category['type']),
          icon: updates.icon ?? (category.get('icon') as unknown as string),
          color: updates.color ?? (category.get('color') as unknown as Category['color']),
          isDefault: updates.isDefault ?? (category.get('isDefault') as unknown as boolean),
          order: updates.order ?? (category.get('order') as unknown as number),
          userId: category.get('userId') as unknown as string,
          createdAt: category.get('createdAt') as unknown as string,
          updatedAt: new Date().toISOString()
        }))
      })
    } catch (error) {
      console.error('Error updating category:', error)
      throw error
    }
  }

  async deleteCategory(id: string): Promise<void> {
    try {
      ydoc.transact(() => {
        categories.delete(id)
      })
    } catch (error) {
      console.error('Error deleting category:', error)
      throw error
    }
  }
}

export const categoryService = new CategoryService()
