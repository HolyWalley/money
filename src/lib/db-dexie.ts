import Dexie, { type EntityTable } from 'dexie';

import type { Category } from '../../shared/schemas/category.schema'
import type { Wallet } from '../../shared/schemas/wallet.schema'
import type { Transaction } from '../../shared/schemas/transaction.schema'

const db = new Dexie('MoneyDB') as Dexie & {
  categories: EntityTable<Category, '_id'>;
  wallets: EntityTable<Wallet, '_id'>;
  transactions: EntityTable<Transaction, '_id'>;
}

db.version(1).stores({
  categories: '_id,name,type,icon,color,isDefault,order,userId,createdAt,updatedAt',
  wallets: '_id,name,type,userId,createdAt,updatedAt,currency,initialBalance',
  transactions: '_id,type,userId,transactionType,amount,currency,toAmount,toCurrency,note,categoryId,walletId,toWalletId,date,createdAt,updatedAt',
});

export { db };
