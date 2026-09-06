import { db, type DexieWallet } from '../lib/db-dexie'
import { computeBrokerCash, getWalletBalanceDelta } from '../lib/wallet-balance'
import { addTransaction, updateTransaction, deleteTransaction } from '../lib/crdts'
import { eventBus } from '../lib/event-bus'
import type { Transaction, CreateTransaction, UpdateTransaction } from '../../shared/schemas/transaction.schema'
import { transactionSchema, createTransactionSchema, updateTransactionSchema } from '../../shared/schemas/transaction.schema'

class TransactionService {

  async getAllTransactions(): Promise<Transaction[]> {
    try {
      const dexieTransactions = await db.transactions.orderBy('createdAt').reverse().toArray()
      // Convert Date objects back to ISO strings
      return dexieTransactions.map(tx => ({
        ...tx,
        date: tx.date.toISOString(),
        createdAt: tx.createdAt.toISOString(),
        updatedAt: tx.updatedAt.toISOString()
      })) as Transaction[]
    } catch (error) {
      console.error('Error fetching transactions:', error)
      throw error
    }
  }

  async getTransactionById(id: string): Promise<Transaction | null> {
    try {
      const transaction = await db.transactions.get(id)
      if (!transaction) return null
      // Convert Date objects back to ISO strings
      return {
        ...transaction,
        date: transaction.date.toISOString(),
        createdAt: transaction.createdAt.toISOString(),
        updatedAt: transaction.updatedAt.toISOString()
      } as Transaction
    } catch (error) {
      console.error('Error fetching transaction:', error)
      throw error
    }
  }

  async getTransactionsByCategory(categoryId: string): Promise<Transaction[]> {
    try {
      const transactions = await db.transactions
        .where('categoryId')
        .equals(categoryId)
        .reverse()
        .sortBy('createdAt')
      // Convert Date objects back to ISO strings
      return transactions.map(tx => ({
        ...tx,
        date: tx.date.toISOString(),
        createdAt: tx.createdAt.toISOString(),
        updatedAt: tx.updatedAt.toISOString()
      })) as Transaction[]
    } catch (error) {
      console.error('Error fetching transactions by category:', error)
      throw error
    }
  }

  async getTransactionsByDateRange(startDate: string, endDate: string): Promise<Transaction[]> {
    try {
      const start = new Date(startDate)
      const end = new Date(endDate)

      const transactions = await db.transactions
        .filter(transaction => {
          return transaction.date >= start && transaction.date <= end
        })
        .reverse()
        .sortBy('createdAt')

      // Convert Date objects back to ISO strings
      return transactions.map(tx => ({
        ...tx,
        date: tx.date.toISOString(),
        createdAt: tx.createdAt.toISOString(),
        updatedAt: tx.updatedAt.toISOString()
      })) as Transaction[]
    } catch (error) {
      console.error('Error fetching transactions by date range:', error)
      throw error
    }
  }

  async createTransaction(data: CreateTransaction): Promise<Transaction> {
    try {
      const validatedData = createTransactionSchema.parse(data)

      const transaction: Omit<Transaction, '_id' | 'createdAt' | 'updatedAt'> = {
        type: 'transaction',
        ...validatedData
      }

      const validatedTransaction = transactionSchema.omit({ _id: true, createdAt: true, updatedAt: true }).parse(transaction)

      const id = addTransaction(validatedTransaction)

      const created: Transaction = {
        _id: id,
        ...validatedTransaction,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      eventBus.emit('transaction:created', created)

      return created
    } catch (error) {
      console.error('Error creating transaction:', error)
      throw error
    }
  }

  async updateTransaction(id: string, updates: UpdateTransaction): Promise<Transaction> {
    try {
      const validatedUpdates = updateTransactionSchema.parse(updates)

      const existingTransaction = await db.transactions.get(id)
      if (!existingTransaction) {
        throw new Error('Transaction not found')
      }

      updateTransaction(id, validatedUpdates)

      // Convert Date objects back to ISO strings for return
      return {
        ...existingTransaction,
        ...validatedUpdates,
        date: validatedUpdates.date ? validatedUpdates.date : existingTransaction.date.toISOString(),
        createdAt: existingTransaction.createdAt.toISOString(),
        updatedAt: new Date().toISOString()
      } as Transaction
    } catch (error) {
      console.error('Error updating transaction:', error)
      throw error
    }
  }

  async deleteTransaction(id: string): Promise<void> {
    try {
      deleteTransaction(id)
    } catch (error) {
      console.error('Error deleting transaction:', error)
      throw error
    }
  }

  async getWalletBalance(walletId: string): Promise<number> {
    try {
      // Get the wallet to include initial balance
      const wallet = await db.wallets.get(walletId)
      if (!wallet) {
        throw new Error('Wallet not found')
      }

      // Two indexed lookups rather than an .or() union: .or() cannot use the
      // bulk getAll() path and walks a cursor row by row instead.
      const [outgoing, incoming] = await Promise.all([
        db.transactions.where('walletId').equals(walletId).toArray(),
        db.transactions.where('toWalletId').equals(walletId).toArray(),
      ])

      let transactionBalance = 0

      for (const transaction of outgoing) {
        transactionBalance += getWalletBalanceDelta(transaction, walletId)
      }

      for (const transaction of incoming) {
        // Already counted above - the delta covers both sides of the transfer.
        if (transaction.walletId === walletId) continue
        transactionBalance += getWalletBalanceDelta(transaction, walletId)
      }

      return wallet.initialBalance + transactionBalance + (await this.getBrokerCash(wallet))
    } catch (error) {
      console.error('Error calculating wallet balance:', error)
      throw error
    }
  }

  /**
   * What a broker's own rows have spent from the wallet holding its cash.
   *
   * Zero for the wallets that are nobody's broker cash, which is nearly all of
   * them - but a linked one is only ever paid into by the user's transfers, so
   * without this it reads as everything ever deposited rather than as what is
   * left to buy something with.
   *
   * cashWalletId carries no index, so the accounts are read whole and matched
   * here. There are only ever a handful of them.
   */
  private async getBrokerCash(wallet: DexieWallet): Promise<number> {
    const accounts = (await db.brokerAccounts.toArray()).filter(
      account => account.cashWalletId === wallet._id
    )
    if (accounts.length === 0) return 0

    const trades = await db.trades
      .where('accountId')
      .anyOf(accounts.map(account => account._id))
      .toArray()

    return computeBrokerCash([wallet], accounts, trades).get(wallet._id) ?? 0
  }

  async getCategoryTotal(categoryId: string, startDate?: string, endDate?: string): Promise<number> {
    try {
      let transactions = await this.getTransactionsByCategory(categoryId)

      if (startDate && endDate) {
        transactions = transactions.filter(transaction => {
          const transactionDate = new Date(transaction.date)
          const start = new Date(startDate)
          const end = new Date(endDate)
          return transactionDate >= start && transactionDate <= end
        })
      }

      let total = 0

      for (const transaction of transactions) {
        if (transaction.transactionType === 'income') {
          total += transaction.amount
        } else if (transaction.transactionType === 'expense') {
          total += transaction.amount
        }
      }

      return total
    } catch (error) {
      console.error('Error calculating category total:', error)
      throw error
    }
  }
}

export const transactionService = new TransactionService()
