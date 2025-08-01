import Dexie, { type EntityTable } from 'dexie';

import type { Category } from '../../shared/schemas/category.schema'
import type { Wallet } from '../../shared/schemas/wallet.schema'
import type { Transaction } from '../../shared/schemas/transaction.schema'
import { addCategoryWithId } from './crdts';

// Define Dexie-specific types with Date objects instead of strings
type DexieCategory = Omit<Category, 'createdAt' | 'updatedAt'> & {
  createdAt: Date;
  updatedAt: Date;
}

type DexieWallet = Omit<Wallet, 'createdAt' | 'updatedAt'> & {
  createdAt: Date;
  updatedAt: Date;
}

type DexieTransaction = Omit<Transaction, 'date' | 'createdAt' | 'updatedAt'> & {
  date: Date;
  createdAt: Date;
  updatedAt: Date;
}

const db = new Dexie('MoneyDB') as Dexie & {
  categories: EntityTable<DexieCategory, '_id'>;
  wallets: EntityTable<DexieWallet, '_id'>;
  transactions: EntityTable<DexieTransaction, '_id'>;
}

db.version(1).stores({
  categories: '_id,name,type,icon,color,isDefault,order,createdAt,updatedAt',
  wallets: '_id,name,type,createdAt,updatedAt,currency,initialBalance',
  transactions: '_id,type,transactionType,amount,currency,toAmount,toCurrency,note,categoryId,walletId,toWalletId,date,createdAt,updatedAt',
});

// Add new version with order field indexed for wallets
db.version(2).stores({
  categories: '_id,name,type,icon,color,isDefault,order,createdAt,updatedAt',
  wallets: '_id,name,type,createdAt,updatedAt,currency,initialBalance,order',
  transactions: '_id,type,transactionType,amount,currency,toAmount,toCurrency,note,categoryId,walletId,toWalletId,date,createdAt,updatedAt',
});

db.version(3).stores({
  categories: '_id,name,type,order,createdAt,updatedAt',
  wallets: '_id,name,type,createdAt,updatedAt,currency,order',
  transactions: '_id,type,transactionType,amount,currency,toAmount,toCurrency,categoryId,walletId,toWalletId,date,createdAt,updatedAt',
})

// Version 4: Convert string dates to Date objects
db.version(4).stores({
  categories: '_id,name,type,order,createdAt,updatedAt',
  wallets: '_id,name,type,createdAt,updatedAt,currency,order',
  transactions: '_id,type,transactionType,amount,currency,toAmount,toCurrency,categoryId,walletId,toWalletId,date,createdAt,updatedAt',
}).upgrade(async tx => {
  // Convert category dates
  await tx.table('categories').toCollection().modify(category => {
    if (typeof category.createdAt === 'string') {
      category.createdAt = new Date(category.createdAt);
    }
    if (typeof category.updatedAt === 'string') {
      category.updatedAt = new Date(category.updatedAt);
    }
  });

  // Convert wallet dates
  await tx.table('wallets').toCollection().modify(wallet => {
    if (typeof wallet.createdAt === 'string') {
      wallet.createdAt = new Date(wallet.createdAt);
    }
    if (typeof wallet.updatedAt === 'string') {
      wallet.updatedAt = new Date(wallet.updatedAt);
    }
  });

  // Convert transaction dates
  await tx.table('transactions').toCollection().modify(transaction => {
    if (typeof transaction.date === 'string') {
      transaction.date = new Date(transaction.date);
    }
    if (typeof transaction.createdAt === 'string') {
      transaction.createdAt = new Date(transaction.createdAt);
    }
    if (typeof transaction.updatedAt === 'string') {
      transaction.updatedAt = new Date(transaction.updatedAt);
    }
  });
});

// Version 5: Adds transfer categories and assign default (misc) to all transfer transactions
db.version(5).stores({
  categories: '_id,name,type,order,createdAt,updatedAt',
  wallets: '_id,name,type,createdAt,updatedAt,currency,order',
  transactions: '_id,type,transactionType,amount,currency,toAmount,toCurrency,categoryId,walletId,toWalletId,date,createdAt,updatedAt',
}).upgrade(async tx => {
  const miscCategoryId = 'default-transfer-misc'
  const existingCategory = await tx.table('categories').get(miscCategoryId)

  if (!existingCategory) {
    const now = new Date()

    addCategoryWithId({
      _id: miscCategoryId,
      name: 'Misc',
      type: 'transfer',
      icon: 'Shapes',
      color: 'gray',
      isDefault: true,
      order: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    })
  }

  // Find transactions that need updating
  const transfersWithoutCategory = await tx.table('transactions')
    .filter(t => t.transactionType === 'transfer' && !t.categoryId)
    .toArray()

  // Update via CRDTs after migration completes
  if (transfersWithoutCategory.length > 0) {
    import('./crdts').then(({ updateTransaction }) => {
      transfersWithoutCategory.forEach(transaction => {
        console.log(`Updating transaction ${transaction._id} via CRDT`)
        updateTransaction(transaction._id, { categoryId: miscCategoryId })
      })
    })
  }
})

export { db };
export type { DexieCategory, DexieWallet, DexieTransaction };
