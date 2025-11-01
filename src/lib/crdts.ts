import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { db } from './db-dexie'
import { v4 as uuid } from 'uuid'

import type { Category } from '../../shared/schemas/category.schema'
import type { Wallet } from '../../shared/schemas/wallet.schema'
import type { Transaction } from '../../shared/schemas/transaction.schema'
import type { DexieCategory, DexieWallet, DexieTransaction } from './db-dexie'

// Helper functions to create properly typed Y.Maps with safe type assertions
function createCategoryMap(data: Omit<Category, '_id'> & { _id: string }): Y.Map<unknown> {
  const entries = Object.entries(data) as [string, unknown][]
  return new Y.Map(entries)
}

function createWalletMap(data: Omit<Wallet, '_id'> & { _id: string }): Y.Map<unknown> {
  const entries = Object.entries(data) as [string, unknown][]
  return new Y.Map(entries)
}

function createTransactionMap(data: Omit<Transaction, '_id'> & { _id: string }): Y.Map<unknown> {
  const entries = Object.entries(data) as [string, unknown][]
  return new Y.Map(entries)
}

const ydoc = new Y.Doc()
new IndexeddbPersistence('money', ydoc)

const categories = ydoc.getMap<Y.Map<unknown>>('categories')
const wallets = ydoc.getMap<Y.Map<unknown>>('wallets')
const transactions = ydoc.getMap<Y.Map<unknown>>('transactions')

categories.observe(event => {
  const keys = event.keys // Force evaluation for Yjs observer

  db.transaction('rw', db.categories, async () => {
    for (const [id, change] of keys) {
      if (change.action === 'delete') {
        await db.categories.delete(id);
      } else {
        const category = categories.get(id);
        if (category) {
          const categoryObj = Object.fromEntries(category.entries()) as Record<string, unknown>;
          // Convert date strings to Date objects for Dexie
          const dexieCategory: DexieCategory = {
            ...(categoryObj as Category),
            createdAt: new Date(categoryObj.createdAt as string),
            updatedAt: new Date(categoryObj.updatedAt as string)
          };
          await db.categories.put(dexieCategory);
        }
      }
    }
  })
})

wallets.observe(event => {
  const keys = event.keys // Force evaluation for Yjs observer

  db.transaction('rw', db.wallets, async () => {
    for (const [id, change] of keys) {
      if (change.action === 'delete') {
        await db.wallets.delete(id);
      } else {
        const wallet = wallets.get(id);
        if (wallet) {
          const walletObj = Object.fromEntries(wallet.entries()) as Record<string, unknown>;
          // Convert date strings to Date objects for Dexie
          const dexieWallet: DexieWallet = {
            ...(walletObj as Wallet),
            createdAt: new Date(walletObj.createdAt as string),
            updatedAt: new Date(walletObj.updatedAt as string)
          };
          await db.wallets.put(dexieWallet);
        }
      }
    }
  });
});

transactions.observe(event => {
  const keys = event.keys // Force evaluation for Yjs observer

  db.transaction('rw', db.transactions, async () => {
    for (const [id, change] of keys) {
      if (change.action === 'delete') {
        await db.transactions.delete(id);
      } else {
        const transaction = transactions.get(id);
        if (transaction) {
          const transactionObj = Object.fromEntries(transaction.entries()) as Record<string, unknown>;
          // Convert date strings to Date objects for Dexie
          const dexieTransaction: DexieTransaction = {
            ...(transactionObj as Transaction),
            date: new Date(transactionObj.date as string),
            createdAt: new Date(transactionObj.createdAt as string),
            updatedAt: new Date(transactionObj.updatedAt as string)
          };
          await db.transactions.put(dexieTransaction);
        }
      }
    }
  });
});

export function addCategory({ name, type, icon, color, isDefault, order }: Omit<Category, '_id' | 'createdAt' | 'updatedAt'>) {
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
}

export function addCategoryWithId(categoryData: Category) {
  ydoc.transact(() => {
    categories.set(categoryData._id, createCategoryMap(categoryData))
  })
  return categoryData._id
}

export function updateCategory(id: string, updates: Partial<Category>) {
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
}

export function addWallet({ name, type, currency, initialBalance, order }: Omit<Wallet, '_id' | 'createdAt' | 'updatedAt'>) {
  const id = uuid()
  ydoc.transact(() => {
    wallets.set(id, createWalletMap({
      _id: id,
      name,
      type,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currency,
      initialBalance,
      order
    }))
  })
  return id
}

export function updateWallet(id: string, updates: Partial<Wallet>) {
  ydoc.transact(() => {
    const wallet = wallets.get(id)
    if (!wallet) return

    if (updates.name !== undefined) wallet.set('name', updates.name)
    if (updates.type !== undefined) wallet.set('type', updates.type)
    if (updates.currency !== undefined) wallet.set('currency', updates.currency)
    if (updates.initialBalance !== undefined) wallet.set('initialBalance', updates.initialBalance)
    if (updates.order !== undefined) wallet.set('order', updates.order)
    wallet.set('updatedAt', new Date().toISOString())
  })
}

export function deleteWallet(id: string) {
  ydoc.transact(() => {
    wallets.delete(id)
  })
}

export function addTransaction({ type, transactionType, amount, currency, toAmount, toCurrency, note, categoryId, walletId, toWalletId, date, split, parts, reimbursement }: Omit<Transaction, '_id' | 'createdAt' | 'updatedAt'>) {
  const id = uuid()
  ydoc.transact(() => {
    transactions.set(id, createTransactionMap({
      _id: id,
      type,
      transactionType,
      amount,
      currency,
      toAmount,
      toCurrency,
      note,
      categoryId,
      walletId,
      toWalletId,
      date,
      split,
      parts,
      reimbursement,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }))
  })
  return id
}

export function updateTransaction(id: string, updates: Partial<Transaction>) {
  ydoc.transact(() => {
    const transaction = transactions.get(id)
    if (!transaction) return

    if (updates.type !== undefined) transaction.set('type', updates.type)
    if (updates.transactionType !== undefined) transaction.set('transactionType', updates.transactionType)
    if (updates.amount !== undefined) transaction.set('amount', updates.amount)
    if (updates.currency !== undefined) transaction.set('currency', updates.currency)
    if (updates.toAmount !== undefined) transaction.set('toAmount', updates.toAmount)
    if (updates.toCurrency !== undefined) transaction.set('toCurrency', updates.toCurrency)
    if (updates.note !== undefined) transaction.set('note', updates.note)
    if (updates.categoryId !== undefined) transaction.set('categoryId', updates.categoryId)
    if (updates.walletId !== undefined) transaction.set('walletId', updates.walletId)
    if (updates.toWalletId !== undefined) transaction.set('toWalletId', updates.toWalletId)
    if (updates.date !== undefined) transaction.set('date', updates.date)
    if (updates.split !== undefined) transaction.set('split', updates.split)
    if (updates.parts !== undefined) transaction.set('parts', updates.parts)
    if (updates.reimbursement !== undefined) transaction.set('reimbursement', updates.reimbursement)
    transaction.set('updatedAt', new Date().toISOString())
  })
}

export function deleteTransaction(id: string) {
  ydoc.transact(() => {
    transactions.delete(id)
  })
}

export {
  ydoc,
  categories,
  wallets,
  transactions,
}
