import { db } from '../lib/db-dexie'
import { addTransaction, updateTransaction, deleteTransaction } from '../lib/crdts'
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

  async getTransactionsByWallet(walletId: string): Promise<Transaction[]> {
    try {
      const transactions = await db.transactions
        .filter(transaction => transaction.walletId === walletId || transaction.toWalletId === walletId)
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
      console.error('Error fetching transactions by wallet:', error)
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

      return {
        _id: id,
        ...validatedTransaction,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
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

      const transactions = await this.getTransactionsByWallet(walletId)
      let transactionBalance = 0

      for (const transaction of transactions) {
        if (transaction.walletId === walletId) {
          if (transaction.transactionType === 'income') {
            transactionBalance += transaction.amount
          } else if (transaction.transactionType === 'expense') {
            transactionBalance -= transaction.amount
          } else if (transaction.transactionType === 'transfer') {
            transactionBalance -= transaction.amount
          }
        }

        if (transaction.toWalletId === walletId && transaction.transactionType === 'transfer') {
          if (transaction.currency === transaction.toCurrency) {
            transactionBalance += transaction.amount || 0
          } else {
            transactionBalance += transaction.toAmount || 0
          }
        }
      }

      // Return initial balance + transaction balance
      return wallet.initialBalance + transactionBalance
    } catch (error) {
      console.error('Error calculating wallet balance:', error)
      throw error
    }
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
