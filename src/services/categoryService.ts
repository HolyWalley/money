import type { Category } from '../../shared/schemas/category.schema'
import * as Y from 'yjs'
// import { createDefaultCategories } from '../lib/default-categories'
import { ydoc, categories } from '../lib/crdts'

import { v4 as uuid } from 'uuid'

class CategoryService {
  // private db: Database

  // constructor(db: Database) {
  //   this.db = db
  // }

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

  async getAllCategories(): Promise<Category[]> {
    // try {
    //   const result = await this.db.categories.allDocs({
    //     include_docs: true
    //   })
    //
    //   const categories: Category[] = []
    //
    //   for (const row of result.rows) {
    //     if (row.doc && !row.id.startsWith('_design/')) {
    //       categories.push(row.doc)
    //     }
    //   }
    //
    //   return categories.sort((a, b) => {
    //     if (a.type !== b.type) {
    //       return a.type === 'income' ? -1 : 1
    //     }
    //     return a.order - b.order
    //   })
    // } catch (error) {
    //   console.error('Error fetching categories:', error)
    //   return []
    // }
  }

  async getCategoriesByType(type: 'income' | 'expense'): Promise<Category[]> {
    // const allCategories = await this.getAllCategories()
    // return allCategories.filter(cat => cat.type === type)
  }

  async getCategoryById(id: string): Promise<Category | null> {
    // try {
    //   const category = await this.db.categories.get(id)
    //   return category
    // } catch (error) {
    //   if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
    //     return null
    //   }
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
