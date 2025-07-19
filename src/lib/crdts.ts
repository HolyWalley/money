import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { db } from './db-dexie'
import { v4 as uuid } from 'uuid'

import type { Category } from '../../shared/schemas/category.schema'
import type { Wallet } from '../../shared/schemas/wallet.schema'
import type { Transaction } from '../../shared/schemas/transaction.schema'

// Helper functions to create properly typed Y.Maps with safe type assertions
function createCategoryMap(data: Omit<Category, '_id'> & { _id: string }): Y.Map<Category> {
  const entries = Object.entries(data) as [string, unknown][]
  return new Y.Map(entries) as unknown as Y.Map<Category>
}

function createWalletMap(data: Omit<Wallet, '_id'> & { _id: string }): Y.Map<Wallet> {
  const entries = Object.entries(data) as [string, unknown][]
  return new Y.Map(entries) as unknown as Y.Map<Wallet>
}

function createTransactionMap(data: Omit<Transaction, '_id'> & { _id: string }): Y.Map<Transaction> {
  const entries = Object.entries(data) as [string, unknown][]
  return new Y.Map(entries) as unknown as Y.Map<Transaction>
}

const ydoc = new Y.Doc()
new IndexeddbPersistence('money', ydoc)

const categories = ydoc.getMap<Y.Map<Category>>('categories')
const wallets = ydoc.getMap<Y.Map<Wallet>>('wallets')
const transactions = ydoc.getMap<Y.Map<Transaction>>('transactions')

categories.observe(event => {
  const keys = event.keys // Force evaluation for Yjs observer

  db.transaction('rw', db.categories, async () => {
    for (const [id, change] of keys) {
      if (change.action === 'delete') {
        await db.categories.delete(id);
      } else {
        const category = categories.get(id);
        if (category) {
          const categoryObj = Object.fromEntries(category.entries()) as unknown as Category;
          await db.categories.put(categoryObj);
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
          const walletObj = Object.fromEntries(wallet.entries()) as unknown as Wallet;
          await db.wallets.put(walletObj);
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
          const transactionObj = Object.fromEntries(transaction.entries()) as unknown as Transaction;
          await db.transactions.put(transactionObj);
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
    categories.set(id, createCategoryMap({
      _id: id,
      name: updates.name ?? (category.get('name') as unknown as string),
      type: updates.type ?? (category.get('type') as unknown as Category['type']),
      icon: updates.icon ?? (category.get('icon') as unknown as string),
      color: updates.color ?? (category.get('color') as unknown as Category['color']),
      isDefault: updates.isDefault ?? (category.get('isDefault') as unknown as boolean),
      order: updates.order ?? (category.get('order') as unknown as number),
      createdAt: category.get('createdAt') as unknown as string,
      updatedAt: new Date().toISOString()
    }))
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
    wallets.set(id, createWalletMap({
      _id: id,
      name: updates.name ?? (wallet.get('name') as unknown as string),
      type: updates.type ?? (wallet.get('type') as unknown as Wallet['type']),
      createdAt: wallet.get('createdAt') as unknown as string,
      updatedAt: new Date().toISOString(),
      currency: updates.currency ?? (wallet.get('currency') as unknown as Wallet['currency']),
      initialBalance: updates.initialBalance ?? (wallet.get('initialBalance') as unknown as number),
      order: updates.order ?? (wallet.get('order') as unknown as number)
    }))
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
    transactions.set(id, createTransactionMap({
      _id: id,
      type: transaction.get('type') as unknown as Transaction['type'],
      transactionType: updates.transactionType ?? (transaction.get('transactionType') as unknown as Transaction['transactionType']),
      amount: updates.amount ?? (transaction.get('amount') as unknown as number),
      currency: updates.currency ?? (transaction.get('currency') as unknown as Transaction['currency']),
      toAmount: updates.toAmount ?? (transaction.get('toAmount') as unknown as unknown as number | undefined),
      toCurrency: updates.toCurrency ?? (transaction.get('toCurrency') as unknown as Transaction['toCurrency']),
      note: updates.note ?? (transaction.get('note') as unknown as string),
      categoryId: updates.categoryId ?? (transaction.get('categoryId') as unknown as string),
      walletId: updates.walletId ?? (transaction.get('walletId') as unknown as string),
      toWalletId: updates.toWalletId ?? (transaction.get('toWalletId') as unknown as unknown as string | undefined),
      date: updates.date ?? (transaction.get('date') as unknown as string),
      split: updates.split ?? (transaction.get('split') as unknown as boolean),
      parts: updates.parts ?? (transaction.get('parts') as unknown as Transaction['parts']),
      reimbursement: updates.reimbursement ?? (transaction.get('reimbursement') as unknown as boolean),
      createdAt: transaction.get('createdAt') as unknown as string,
      updatedAt: new Date().toISOString()
    }))
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
