import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { db } from './db-dexie'
import { v4 as uuid } from 'uuid'

import type { Category } from '../../shared/schemas/category.schema'
import type { Wallet } from '../../shared/schemas/wallet.schema'
import type { Transaction } from '../../shared/schemas/transaction.schema'
import type { RecurringPayment, RecurringPaymentLog } from '../../shared/schemas/recurring-payment.schema'
import type { DexieCategory, DexieWallet, DexieTransaction, DexieRecurringPayment, DexieRecurringPaymentLog } from './db-dexie'

// Yjs event types
interface YMapEvent {
  keys: Map<string, { action: 'add' | 'update' | 'delete'; oldValue: unknown }>;
  target: Y.Map<unknown>;
}

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

function createRecurringPaymentMap(data: Omit<RecurringPayment, '_id'> & { _id: string }): Y.Map<unknown> {
  const entries = Object.entries(data) as [string, unknown][]
  return new Y.Map(entries)
}

function createRecurringPaymentLogMap(data: Omit<RecurringPaymentLog, '_id'> & { _id: string }): Y.Map<unknown> {
  const entries = Object.entries(data) as [string, unknown][]
  return new Y.Map(entries)
}

const ydoc = new Y.Doc()
new IndexeddbPersistence('money', ydoc)

const categories = ydoc.getMap<Y.Map<unknown>>('categories')
const wallets = ydoc.getMap<Y.Map<unknown>>('wallets')
const transactions = ydoc.getMap<Y.Map<unknown>>('transactions')
const recurringPayments = ydoc.getMap<Y.Map<unknown>>('recurringPayments')
const recurringPaymentLogs = ydoc.getMap<Y.Map<unknown>>('recurringPaymentLogs')

// Generic observer setup for Yjs maps syncing to Dexie
function setupDeepObserver<TDexie>(
  yjsMap: Y.Map<Y.Map<unknown>>,
  dexieTable: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  transformToDexie: (obj: Record<string, unknown>) => TDexie
) {
  yjsMap.observeDeep(events => {
    const changedIds = new Set<string>();
    const deletedIds = new Set<string>();

    // Collect all affected entity IDs from the events
    events.forEach(event => {
      if (event.path.length === 0) {
        // Top-level map change (add/delete)
        // Check the event target to get the changed keys
        if (event.target === yjsMap) {
          // This is a YMapEvent on the top-level map
          const mapEvent = event as unknown as YMapEvent;
          if (mapEvent.keys) {
            mapEvent.keys.forEach((change, key) => {
              if (change.action === 'delete') {
                deletedIds.add(key);
              } else {
                changedIds.add(key);
              }
            });
          }
        }
      } else if (event.path.length > 0) {
        // Nested change (property update within an entity)
        // path[0] is the entity ID
        const id = event.path[0] as string;
        changedIds.add(id);
      }
    });

    db.transaction('rw', dexieTable, async () => {
      // Handle updates/additions
      for (const id of changedIds) {
        const entity = yjsMap.get(id);
        if (entity) {
          const entityObj = Object.fromEntries(entity.entries()) as Record<string, unknown>;
          const dexieEntity = transformToDexie(entityObj);
          await dexieTable.put(dexieEntity);
        }
      }

      // Handle deletions
      for (const id of deletedIds) {
        await dexieTable.delete(id);
      }
    });
  });
}

// Setup observers after a microtask to ensure db is initialized
Promise.resolve().then(() => {
  // Setup observers for categories
  setupDeepObserver<DexieCategory>(
    categories,
    db.categories,
    (obj) => {
      const now = new Date();
      const createdAt = obj.createdAt ? new Date(obj.createdAt as string) : now;
      const updatedAt = obj.updatedAt ? new Date(obj.updatedAt as string) : now;

      return {
        ...(obj as Category),
        createdAt: isNaN(createdAt.getTime()) ? now : createdAt,
        updatedAt: isNaN(updatedAt.getTime()) ? now : updatedAt
      };
    }
  );

  // Setup observers for wallets
  setupDeepObserver<DexieWallet>(
    wallets,
    db.wallets,
    (obj) => {
      const now = new Date();
      const createdAt = obj.createdAt ? new Date(obj.createdAt as string) : now;
      const updatedAt = obj.updatedAt ? new Date(obj.updatedAt as string) : now;

      return {
        ...(obj as Wallet),
        createdAt: isNaN(createdAt.getTime()) ? now : createdAt,
        updatedAt: isNaN(updatedAt.getTime()) ? now : updatedAt
      };
    }
  );

  // Setup observers for transactions
  setupDeepObserver<DexieTransaction>(
    transactions,
    db.transactions,
    (obj) => {
      const now = new Date();
      const date = obj.date ? new Date(obj.date as string) : now;
      const createdAt = obj.createdAt ? new Date(obj.createdAt as string) : now;
      const updatedAt = obj.updatedAt ? new Date(obj.updatedAt as string) : now;

      return {
        ...(obj as Transaction),
        date: isNaN(date.getTime()) ? now : date,
        createdAt: isNaN(createdAt.getTime()) ? now : createdAt,
        updatedAt: isNaN(updatedAt.getTime()) ? now : updatedAt
      };
    }
  );

  // Setup observers for recurring payments
  setupDeepObserver<DexieRecurringPayment>(
    recurringPayments,
    db.recurringPayments,
    (obj) => {
      const now = new Date();
      const startDate = obj.startDate ? new Date(obj.startDate as string) : now;
      const endDate = obj.endDate ? new Date(obj.endDate as string) : undefined;
      const createdAt = obj.createdAt ? new Date(obj.createdAt as string) : now;
      const updatedAt = obj.updatedAt ? new Date(obj.updatedAt as string) : now;

      return {
        ...(obj as RecurringPayment),
        startDate: isNaN(startDate.getTime()) ? now : startDate,
        endDate: endDate && !isNaN(endDate.getTime()) ? endDate : undefined,
        createdAt: isNaN(createdAt.getTime()) ? now : createdAt,
        updatedAt: isNaN(updatedAt.getTime()) ? now : updatedAt
      };
    }
  );

  // Setup observers for recurring payment logs
  setupDeepObserver<DexieRecurringPaymentLog>(
    recurringPaymentLogs,
    db.recurringPaymentLogs,
    (obj) => {
      const now = new Date();
      const scheduledDate = obj.scheduledDate ? new Date(obj.scheduledDate as string) : now;
      const createdAt = obj.createdAt ? new Date(obj.createdAt as string) : now;

      return {
        ...(obj as RecurringPaymentLog),
        scheduledDate: isNaN(scheduledDate.getTime()) ? now : scheduledDate,
        createdAt: isNaN(createdAt.getTime()) ? now : createdAt
      };
    }
  );
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

export function addTransaction({ type, transactionType, amount, currency, toAmount, toCurrency, note, categoryId, walletId, toWalletId, date, split, parts, reimbursement, recurringPaymentLogId }: Omit<Transaction, '_id' | 'createdAt' | 'updatedAt'>) {
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
      recurringPaymentLogId,
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
    if (updates.recurringPaymentLogId !== undefined) transaction.set('recurringPaymentLogId', updates.recurringPaymentLogId)
    transaction.set('updatedAt', new Date().toISOString())
  })
}

export function deleteTransaction(id: string) {
  ydoc.transact(() => {
    transactions.delete(id)
  })
}

export function addRecurringPayment({
  amount,
  currency,
  categoryId,
  walletId,
  toWalletId,
  transactionType,
  description,
  rrule,
  startDate,
  endDate,
  sourceTransactionId,
}: Omit<RecurringPayment, '_id' | 'isActive' | 'createdAt' | 'updatedAt'>) {
  const id = uuid()
  ydoc.transact(() => {
    recurringPayments.set(id, createRecurringPaymentMap({
      _id: id,
      amount,
      currency,
      categoryId,
      walletId,
      toWalletId,
      transactionType,
      description,
      rrule,
      startDate,
      endDate,
      isActive: true,
      sourceTransactionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }))
  })
  return id
}

export function updateRecurringPayment(id: string, updates: Partial<RecurringPayment>) {
  ydoc.transact(() => {
    const recurringPayment = recurringPayments.get(id)
    if (!recurringPayment) return

    if (updates.amount !== undefined) recurringPayment.set('amount', updates.amount)
    if (updates.currency !== undefined) recurringPayment.set('currency', updates.currency)
    if (updates.categoryId !== undefined) recurringPayment.set('categoryId', updates.categoryId)
    if (updates.walletId !== undefined) recurringPayment.set('walletId', updates.walletId)
    if (updates.toWalletId !== undefined) recurringPayment.set('toWalletId', updates.toWalletId)
    if (updates.transactionType !== undefined) recurringPayment.set('transactionType', updates.transactionType)
    if (updates.description !== undefined) recurringPayment.set('description', updates.description)
    if (updates.rrule !== undefined) recurringPayment.set('rrule', updates.rrule)
    if (updates.startDate !== undefined) recurringPayment.set('startDate', updates.startDate)
    if (updates.endDate !== undefined) recurringPayment.set('endDate', updates.endDate)
    if (updates.isActive !== undefined) recurringPayment.set('isActive', updates.isActive)
    recurringPayment.set('updatedAt', new Date().toISOString())
  })
}

export function deleteRecurringPayment(id: string) {
  ydoc.transact(() => {
    recurringPayments.delete(id)
  })
}

export function addRecurringPaymentLog({
  _id,
  recurringPaymentId,
  scheduledDate,
  status,
  transactionId,
}: Omit<RecurringPaymentLog, 'createdAt'>) {
  ydoc.transact(() => {
    recurringPaymentLogs.set(_id, createRecurringPaymentLogMap({
      _id,
      recurringPaymentId,
      scheduledDate,
      status,
      transactionId,
      createdAt: new Date().toISOString()
    }))
  })
  return _id
}

export function updateRecurringPaymentLog(id: string, updates: Partial<RecurringPaymentLog>) {
  ydoc.transact(() => {
    const log = recurringPaymentLogs.get(id)
    if (!log) return

    if (updates.status !== undefined) log.set('status', updates.status)
    if (updates.transactionId !== undefined) log.set('transactionId', updates.transactionId)
  })
}

export {
  ydoc,
  categories,
  wallets,
  transactions,
  recurringPayments,
  recurringPaymentLogs,
}
