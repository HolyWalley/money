import type { Database, Category } from '../lib/db'
import { createDefaultCategories } from '../lib/default-categories'

export class CategoryService {
  private db: Database

  constructor(db: Database) {
    this.db = db
  }

  async initializeDefaultCategories(userId: string): Promise<void> {
    try {
      const existingCategories = await this.getAllCategories()
      
      if (existingCategories.length === 0) {
        const defaultCategories = createDefaultCategories(userId)
        
        for (const category of defaultCategories) {
          const categoryWithId = {
            ...category,
            _id: `category_${category.type}_${category.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`
          }
          await this.db.categories.put(categoryWithId)
        }
      }
    } catch (error) {
      console.error('Error initializing default categories:', error)
      throw error
    }
  }

  async getAllCategories(): Promise<Category[]> {
    try {
      const result = await this.db.categories.allDocs({
        include_docs: true
      })
      
      const categories: Category[] = []
      
      for (const row of result.rows) {
        if (row.doc && !row.id.startsWith('_design/')) {
          categories.push(row.doc)
        }
      }
      
      return categories.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'income' ? -1 : 1
        }
        return a.order - b.order
      })
    } catch (error) {
      console.error('Error fetching categories:', error)
      return []
    }
  }

  async getCategoriesByType(type: 'income' | 'expense'): Promise<Category[]> {
    const allCategories = await this.getAllCategories()
    return allCategories.filter(cat => cat.type === type)
  }

  async getCategoryById(id: string): Promise<Category | null> {
    try {
      const category = await this.db.categories.get(id)
      return category
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        return null
      }
      throw error
    }
  }

  async createCategory(categoryData: Omit<Category, '_id' | 'createdAt' | 'updatedAt'>): Promise<Category> {
    try {
      const userId = categoryData.userId
      if (!userId) {
        throw new Error('userId is required')
      }
      
      const timestamp = new Date().toISOString()
      const newCategory: Category = {
        ...categoryData,
        _id: `category_${categoryData.type}_${categoryData.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`,
        userId,
        createdAt: timestamp,
        updatedAt: timestamp
      }
      
      await this.db.categories.put(newCategory)
      return newCategory
    } catch (error) {
      console.error('Error creating category:', error)
      throw error
    }
  }

  async updateCategory(id: string, updates: Partial<Category>): Promise<Category> {
    try {
      const existingCategory = await this.db.categories.get(id)
      if (!existingCategory) {
        throw new Error('Category not found')
      }
      
      const updatedCategory: Category = {
        ...existingCategory,
        ...updates,
        _id: existingCategory._id,
        userId: existingCategory.userId,
        updatedAt: new Date().toISOString()
      }
      
      await this.db.categories.put(updatedCategory)
      return updatedCategory
    } catch (error) {
      console.error('Error updating category:', error)
      throw error
    }
  }
}
