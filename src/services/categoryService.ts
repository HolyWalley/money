import type { Category } from '../../shared/schemas/category.schema'
import * as Y from 'yjs'
// import { createDefaultCategories } from '../lib/default-categories'
import { ydoc, categories } from '../lib/crdts'

import { v4 as uuid } from 'uuid'

class CategoryService {
  async initializeDefaultCategories(userId: string): Promise<void> {
    // try {
    //   const existingCategories = await this.getAllCategories()
    //
    //   if (existingCategories.length === 0) {
    //     const defaultCategories = createDefaultCategories(userId)
    //
    //     for (const category of defaultCategories) {
    //       const categoryWithId = {
    //         ...category,
    //         _id: `category_${category.type}_${category.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`
    //       }
    //       await this.db.categories.put(categoryWithId)
    //     }
    //   }
    // } catch (error) {
    //   console.error('Error initializing default categories:', error)
    //   throw error
    // }
  }

  createCategory(categoryData: Omit<Category, '_id' | 'createdAt' | 'updatedAt'>): string {
    try {
      const { name, type, icon, color, isDefault, order, userId } = categoryData
      const id = uuid()
      ydoc.transact(() => {
        categories.set(id, new Y.Map([
          ['_id', id],
          ['name', name],
          ['type', type],
          ['icon', icon],
          ['color', color],
          ['isDefault', isDefault],
          ['order', order],
          ['userId', userId],
          ['createdAt', new Date().toISOString()],
          ['updatedAt', new Date().toISOString()]
        ]))
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
        categories.set(id, new Y.Map([
          ['_id', id],
          ['name', updates.name ?? category.get('name')],
          ['type', updates.type ?? category.get('type')],
          ['icon', updates.icon ?? category.get('icon')],
          ['color', updates.color ?? category.get('color')],
          ['isDefault', updates.isDefault ?? category.get('isDefault')],
          ['order', updates.order ?? category.get('order')],
          ['userId', category.get('userId')],
          ['createdAt', category.get('createdAt')],
          ['updatedAt', new Date().toISOString()]
        ]))
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
