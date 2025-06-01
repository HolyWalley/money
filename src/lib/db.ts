import PouchDB from 'pouchdb-browser'
import type { Category } from '../../shared/schemas/category.schema'
import type { Wallet } from '../../shared/schemas/wallet.schema'

export interface Database {
  categories: PouchDB.Database<Category>
  wallets: PouchDB.Database<Wallet>
}

export type { Category, Wallet }

const dbPrefix = 'money_'

export function createDatabase(userId: string): Database {
  return {
    categories: new PouchDB<Category>(`${dbPrefix}${userId}_categories`),
    wallets: new PouchDB<Wallet>(`${dbPrefix}${userId}_wallets`)
  }
}
