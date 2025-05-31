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
}
