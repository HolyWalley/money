import PouchDB from 'pouchdb-browser'
import type { Category } from '../../shared/schemas/category.schema'
import type { Wallet } from '../../shared/schemas/wallet.schema'
import type { Transaction } from '../../shared/schemas/transaction.schema'

export interface Database {
  categories: PouchDB.Database<Category>
  wallets: PouchDB.Database<Wallet>
  transactions: PouchDB.Database<Transaction>
}

export type { Category, Wallet, Transaction }

const dbPrefix = 'money_'

export function createDatabase(userId: string): Database {
  return {
    categories: new PouchDB<Category>(`${dbPrefix}${userId}_categories`),
    wallets: new PouchDB<Wallet>(`${dbPrefix}${userId}_wallets`),
    transactions: new PouchDB<Transaction>(`${dbPrefix}${userId}_transactions`)
  }
}
