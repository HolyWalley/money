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
        const category = Object.fromEntries(categories.get(id).entries());
        console.log('category', category);
        await db.categories.put(category);
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
        const wallet = Object.fromEntries(wallets.get(id).entries());
        await db.wallets.put(wallet);
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
        const transaction = Object.fromEntries(transactions.get(id).entries());
        await db.transactions.put(transaction);
      }
    }
  });
});

export function addCategory({ name, type, icon, color, isDefault, order, userId }: Category) {
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
    ]))
  })
}

export function addWallet({ name, type, userId, createdAt, updatedAt, currency, initialBalance }: Wallet) {
  const id = uuid()
  ydoc.transact(() => {
    wallets.set(id, new Y.Map([
      ['_id', id],
      ['name', name],
      ['type', type],
      ['userId', userId],
      ['createdAt', createdAt],
      ['updatedAt', updatedAt],
      ['currency', currency],
      ['initialBalance', initialBalance]
    ]))
  })
  return id
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
    ]))
  })
  return id
}

export {
  ydoc,
  categories,
  wallets,
  transactions,
}
