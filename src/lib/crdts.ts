import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { db } from './db-dexie'
import { v4 as uuid } from 'uuid'

import type { Category } from '../../shared/schemas/category.schema'
import type { Wallet } from '../../shared/schemas/wallet.schema'
import type { Transaction } from '../../shared/schemas/transaction.schema'

const ydoc = new Y.Doc()
new IndexeddbPersistence('money', ydoc)

const categories = ydoc.getMap<Y.Map<Category>>('categories')
const wallets = ydoc.getMap<Y.Map<Wallet>>('wallets')
const transactions = ydoc.getMap<Y.Map<Transaction>>('transactions')

categories.observe(event => {
  console.log('categories', event.keys) // Figure out why we still need it

  db.transaction('rw', db.categories, async () => {
    for (const [id, change] of event.keys) {
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
  console.log('Wallets keys:', event.keys);
  db.transaction('rw', db.wallets, async () => {
    for (const [id, change] of event.keys) {
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
  console.log('Transactions keys:', event.keys);
  db.transaction('rw', db.transactions, async () => {
    for (const [id, change] of event.keys) {
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

export function addCategory({ name, type, icon, color, isDefault, order, userId }: Omit<Category, '_id' | 'createdAt' | 'updatedAt'>) {
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
    ]) as any)
  })
  return id
}

export function updateCategory(id: string, updates: Partial<Category>) {
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
    ]) as any)
  })
}

export function addWallet({ name, type, userId, currency, initialBalance }: Omit<Wallet, '_id' | 'createdAt' | 'updatedAt'>) {
  const id = uuid()
  ydoc.transact(() => {
    wallets.set(id, new Y.Map([
      ['_id', id],
      ['name', name],
      ['type', type],
      ['userId', userId],
      ['createdAt', new Date().toISOString()],
      ['updatedAt', new Date().toISOString()],
      ['currency', currency],
      ['initialBalance', initialBalance]
    ]) as any)
  })
  return id
}

export function updateWallet(id: string, updates: Partial<Wallet>) {
  ydoc.transact(() => {
    const wallet = wallets.get(id)
    if (!wallet) return
    wallets.set(id, new Y.Map([
      ['_id', id],
      ['name', updates.name ?? wallet.get('name')],
      ['type', updates.type ?? wallet.get('type')],
      ['userId', wallet.get('userId')],
      ['createdAt', wallet.get('createdAt')],
      ['updatedAt', new Date().toISOString()],
      ['currency', updates.currency ?? wallet.get('currency')],
      ['initialBalance', updates.initialBalance ?? wallet.get('initialBalance')]
    ]) as any)
  })
}

export function deleteWallet(id: string) {
  ydoc.transact(() => {
    wallets.delete(id)
  })
}

export function addTransaction({ type, userId, transactionType, amount, currency, toAmount, toCurrency, note, categoryId, walletId, toWalletId, date, createdAt, updatedAt }: Transaction) {
  const id = uuid()
  ydoc.transact(() => {
    transactions.set(id, new Y.Map([
      ['_id', id],
      ['type', type],
      ['userId', userId],
      ['transactionType', transactionType],
      ['amount', amount],
      ['currency', currency],
      ['toAmount', toAmount],
      ['toCurrency', toCurrency],
      ['note', note],
      ['categoryId', categoryId],
      ['walletId', walletId],
      ['toWalletId', toWalletId],
      ['date', date],
      ['createdAt', createdAt],
      ['updatedAt', updatedAt]
    ]) as any)
  })
  return id
}

export {
  ydoc,
  categories,
  wallets,
  transactions,
}
