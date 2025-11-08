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

export interface ExchangeRateRecord {
  key: string;
  from: string;
  to: string;
  date: string;
  rate: number;
  expiresAt: number | null;
}

const db = new Dexie('MoneyDB') as Dexie & {
  categories: EntityTable<DexieCategory, '_id'>;
  wallets: EntityTable<DexieWallet, '_id'>;
  transactions: EntityTable<DexieTransaction, '_id'>;
  exchangeRates: EntityTable<ExchangeRateRecord, 'key'>;
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
});

// Version 5: Adds transfer categories and assign default (misc) to all transfer transactions
db.version(5).stores({
  categories: '_id,name,type,order,createdAt,updatedAt',
  wallets: '_id,name,type,createdAt,updatedAt,currency,order',
  transactions: '_id,type,transactionType,amount,currency,toAmount,toCurrency,categoryId,walletId,toWalletId,date,createdAt,updatedAt',
});

// Version 6: Add exchangeRates table for exchange rate caching
db.version(6).stores({
  categories: '_id,name,type,order,createdAt,updatedAt',
  wallets: '_id,name,type,createdAt,updatedAt,currency,order',
  transactions: '_id,type,transactionType,amount,currency,toAmount,toCurrency,categoryId,walletId,toWalletId,date,createdAt,updatedAt',
  exchangeRates: 'key,from,to,date',
})

// Version 7: Add expiresAt field to exchangeRates for cache expiration
db.version(7).stores({
  categories: '_id,name,type,order,createdAt,updatedAt',
  wallets: '_id,name,type,createdAt,updatedAt,currency,order',
  transactions: '_id,type,transactionType,amount,currency,toAmount,toCurrency,categoryId,walletId,toWalletId,date,createdAt,updatedAt',
  exchangeRates: 'key,from,to,date,expiresAt',
})

// Version 8: Migrate split field to reimbursement field
db.version(8).stores({
  categories: '_id,name,type,order,createdAt,updatedAt',
  wallets: '_id,name,type,createdAt,updatedAt,currency,order',
  transactions: '_id,type,transactionType,amount,currency,toAmount,toCurrency,categoryId,walletId,toWalletId,date,createdAt,updatedAt',
  exchangeRates: 'key,from,to,date,expiresAt',
});

export { db };
export type { DexieCategory, DexieWallet, DexieTransaction };
