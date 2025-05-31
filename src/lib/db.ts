import PouchDB from 'pouchdb-browser'
import type { Category } from '../../shared/schemas/category.schema'

export interface Database {
  categories: PouchDB.Database<Category>
}

export type { Category }

const dbPrefix = 'money_'

export function createDatabase(userId: string): Database {
  return {
    categories: new PouchDB<Category>(`${dbPrefix}${userId}_categories`)
  }
}
