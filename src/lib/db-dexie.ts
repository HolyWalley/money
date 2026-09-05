import Dexie, { type EntityTable } from 'dexie';

import type { Category } from '../../shared/schemas/category.schema'
import type { Wallet } from '../../shared/schemas/wallet.schema'
import type { Transaction } from '../../shared/schemas/transaction.schema'
import type { RecurringPayment, RecurringPaymentLog } from '../../shared/schemas/recurring-payment.schema'
import type { SavingGoal } from '../../shared/schemas/saving-goal.schema'
import type { BrokerAccount } from '../../shared/schemas/broker-account.schema'
import type { Instrument } from '../../shared/schemas/instrument.schema'
import type { Trade } from '../../shared/schemas/trade.schema'

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

type DexieRecurringPayment = Omit<RecurringPayment, 'startDate' | 'endDate' | 'createdAt' | 'updatedAt'> & {
  startDate: Date;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

type DexieRecurringPaymentLog = Omit<RecurringPaymentLog, 'scheduledDate' | 'createdAt'> & {
  scheduledDate: Date;
  createdAt: Date;
}

type DexieSavingGoal = Omit<SavingGoal, 'createdAt' | 'updatedAt' | 'targetDate'> & {
  targetDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

type DexieBrokerAccount = Omit<BrokerAccount, 'createdAt' | 'updatedAt'> & {
  createdAt: Date;
  updatedAt: Date;
}

type DexieInstrument = Omit<Instrument, 'createdAt' | 'updatedAt'> & {
  createdAt: Date;
  updatedAt: Date;
}

type DexieTrade = Omit<Trade, 'date' | 'createdAt' | 'updatedAt'> & {
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

// A local cache of closing prices, not synced state: keyed `${symbol}:${date}`
// so a refetch of the same day overwrites rather than accumulates.
export interface InstrumentPriceRecord {
  key: string;
  symbol: string;
  date: string;
  close: number;
  currency: string;
  fetchedAt: number;
}

const db = new Dexie('MoneyDB') as Dexie & {
  categories: EntityTable<DexieCategory, '_id'>;
  wallets: EntityTable<DexieWallet, '_id'>;
  transactions: EntityTable<DexieTransaction, '_id'>;
  exchangeRates: EntityTable<ExchangeRateRecord, 'key'>;
  recurringPayments: EntityTable<DexieRecurringPayment, '_id'>;
  recurringPaymentLogs: EntityTable<DexieRecurringPaymentLog, '_id'>;
  savingGoals: EntityTable<DexieSavingGoal, '_id'>;
  brokerAccounts: EntityTable<DexieBrokerAccount, '_id'>;
  instruments: EntityTable<DexieInstrument, '_id'>;
  trades: EntityTable<DexieTrade, '_id'>;
  instrumentPrices: EntityTable<InstrumentPriceRecord, 'key'>;
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

// Version 9: Add recurring payments and logs tables
db.version(9).stores({
  categories: '_id,name,type,order,createdAt,updatedAt',
  wallets: '_id,name,type,createdAt,updatedAt,currency,order',
  transactions: '_id,type,transactionType,amount,currency,toAmount,toCurrency,categoryId,walletId,toWalletId,date,createdAt,updatedAt,recurringPaymentLogId',
  exchangeRates: 'key,from,to,date,expiresAt',
  recurringPayments: '_id,isActive,categoryId,walletId,startDate,createdAt,updatedAt',
  recurringPaymentLogs: '_id,recurringPaymentId,scheduledDate,status,transactionId,createdAt',
});

// Version 10: Add saving goals table
db.version(10).stores({
  categories: '_id,name,type,order,createdAt,updatedAt',
  wallets: '_id,name,type,createdAt,updatedAt,currency,order',
  transactions: '_id,type,transactionType,amount,currency,toAmount,toCurrency,categoryId,walletId,toWalletId,date,createdAt,updatedAt,recurringPaymentLogId',
  exchangeRates: 'key,from,to,date,expiresAt',
  recurringPayments: '_id,isActive,categoryId,walletId,startDate,createdAt,updatedAt',
  recurringPaymentLogs: '_id,recurringPaymentId,scheduledDate,status,transactionId,createdAt',
  savingGoals: '_id,walletId,name,achieved,order,createdAt,updatedAt',
});

// Version 11: Add targetDate field to saving goals
db.version(11).stores({
  categories: '_id,name,type,order,createdAt,updatedAt',
  wallets: '_id,name,type,createdAt,updatedAt,currency,order',
  transactions: '_id,type,transactionType,amount,currency,toAmount,toCurrency,categoryId,walletId,toWalletId,date,createdAt,updatedAt,recurringPaymentLogId',
  exchangeRates: 'key,from,to,date,expiresAt',
  recurringPayments: '_id,isActive,categoryId,walletId,startDate,createdAt,updatedAt',
  recurringPaymentLogs: '_id,recurringPaymentId,scheduledDate,status,transactionId,createdAt',
  savingGoals: '_id,walletId,name,achieved,order,targetDate,createdAt,updatedAt',
});

// Version 12: Add savingsWalletId on recurringPayments and sourceRecurringPaymentId on savingGoals
db.version(12).stores({
  categories: '_id,name,type,order,createdAt,updatedAt',
  wallets: '_id,name,type,createdAt,updatedAt,currency,order',
  transactions: '_id,type,transactionType,amount,currency,toAmount,toCurrency,categoryId,walletId,toWalletId,date,createdAt,updatedAt,recurringPaymentLogId',
  exchangeRates: 'key,from,to,date,expiresAt',
  recurringPayments: '_id,isActive,categoryId,walletId,startDate,savingsWalletId,createdAt,updatedAt',
  recurringPaymentLogs: '_id,recurringPaymentId,scheduledDate,status,transactionId,createdAt',
  savingGoals: '_id,walletId,name,achieved,order,targetDate,sourceRecurringPaymentId,createdAt,updatedAt',
});

// Version 13: Add broker accounts, instruments, trades and the instrument price cache
db.version(13).stores({
  categories: '_id,name,type,order,createdAt,updatedAt',
  wallets: '_id,name,type,createdAt,updatedAt,currency,order',
  transactions: '_id,type,transactionType,amount,currency,toAmount,toCurrency,categoryId,walletId,toWalletId,date,createdAt,updatedAt,recurringPaymentLogId',
  exchangeRates: 'key,from,to,date,expiresAt',
  recurringPayments: '_id,isActive,categoryId,walletId,startDate,savingsWalletId,createdAt,updatedAt',
  recurringPaymentLogs: '_id,recurringPaymentId,scheduledDate,status,transactionId,createdAt',
  savingGoals: '_id,walletId,name,achieved,order,targetDate,sourceRecurringPaymentId,createdAt,updatedAt',
  brokerAccounts: '_id,name,broker,order,createdAt,updatedAt',
  instruments: '_id,isin,ticker,symbol,name,currency,kind,createdAt,updatedAt',
  trades: '_id,accountId,instrumentId,kind,date,externalId,createdAt,updatedAt',
  instrumentPrices: 'key,symbol,date',
});

export { db };
export type { DexieCategory, DexieWallet, DexieTransaction, DexieRecurringPayment, DexieRecurringPaymentLog, DexieSavingGoal, DexieBrokerAccount, DexieInstrument, DexieTrade };
