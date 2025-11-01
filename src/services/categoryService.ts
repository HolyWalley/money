import type { Category } from '../../shared/schemas/category.schema'
import * as Y from 'yjs'
import { ydoc, categories } from '../lib/crdts'
import { v4 as uuid } from 'uuid'

// Helper function to create properly typed Y.Map for categories with safe type assertion
function createCategoryMap(data: Omit<Category, '_id'> & { _id: string }): Y.Map<unknown> {
  const entries = Object.entries(data) as [string, unknown][]
  return new Y.Map(entries)
}

class CategoryService {
  createCategory(categoryData: Omit<Category, '_id' | 'createdAt' | 'updatedAt'>): string {
    try {
      const { name, type, icon, color, isDefault, order } = categoryData
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

        if (updates.name !== undefined) category.set('name', updates.name)
        if (updates.type !== undefined) category.set('type', updates.type)
        if (updates.icon !== undefined) category.set('icon', updates.icon)
        if (updates.color !== undefined) category.set('color', updates.color)
        if (updates.isDefault !== undefined) category.set('isDefault', updates.isDefault)
        if (updates.order !== undefined) category.set('order', updates.order)
        category.set('updatedAt', new Date().toISOString())
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
