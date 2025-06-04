import type { Database } from '../lib/db'
import type { Transaction, CreateTransaction, UpdateTransaction } from '../../shared/schemas/transaction.schema'
import { transactionSchema, createTransactionSchema, updateTransactionSchema } from '../../shared/schemas/transaction.schema'

export class TransactionService {
  private db: Database

  constructor(db: Database) {
    this.db = db
  }

  async getAllTransactions(): Promise<Transaction[]> {
    try {
      const result = await this.db.transactions.allDocs({
        include_docs: true,
        descending: true
      })

      const transactions: Transaction[] = []

      for (const row of result.rows) {
        if (row.doc) {
          transactions.push(row.doc)
        }
      }

      return transactions
    } catch (error) {
      console.error('Error fetching transactions:', error)
      throw error
    }
  }

  async getTransactionById(id: string): Promise<Transaction | null> {
    try {
      const transaction = await this.db.transactions.get(id)
      return transaction
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        return null
      }
      console.error('Error fetching transaction:', error)
      throw error
    }
  }

  async getTransactionsByWallet(walletId: string): Promise<Transaction[]> {
    try {
      const result = await this.db.transactions.allDocs({
        include_docs: true,
        descending: true
      })

      const transactions: Transaction[] = []

      for (const row of result.rows) {
        if (row.doc && (row.doc.walletId === walletId || row.doc.toWalletId === walletId)) {
          transactions.push(row.doc)
        }
      }

      return transactions
    } catch (error) {
      console.error('Error fetching transactions by wallet:', error)
      throw error
    }
  }

  async getTransactionsByCategory(categoryId: string): Promise<Transaction[]> {
    try {
      const result = await this.db.transactions.allDocs({
        include_docs: true,
        descending: true
      })

      const transactions: Transaction[] = []

      for (const row of result.rows) {
        if (row.doc && row.doc.categoryId === categoryId) {
          transactions.push(row.doc)
        }
      }

      return transactions
    } catch (error) {
      console.error('Error fetching transactions by category:', error)
      throw error
    }
  }

  async getTransactionsByDateRange(startDate: string, endDate: string): Promise<Transaction[]> {
    try {
      const result = await this.db.transactions.allDocs({
        include_docs: true,
        descending: true
      })

      const transactions: Transaction[] = []

      for (const row of result.rows) {
        if (row.doc) {
          const transactionDate = new Date(row.doc.date)
          const start = new Date(startDate)
          const end = new Date(endDate)
          
          if (transactionDate >= start && transactionDate <= end) {
            transactions.push(row.doc)
          }
        }
      }

      return transactions
    } catch (error) {
      console.error('Error fetching transactions by date range:', error)
      throw error
    }
  }

  async createTransaction(userId: string, data: CreateTransaction): Promise<Transaction> {
    try {
      const validatedData = createTransactionSchema.parse(data)

      const timestamp = Date.now().toString()
      const sanitizedDescription = validatedData.description.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 30)

      const transaction: Transaction = {
        _id: `transaction_${sanitizedDescription}_${timestamp}`,
        type: 'transaction',
        userId,
        ...validatedData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      const validatedTransaction = transactionSchema.parse(transaction)

      const response = await this.db.transactions.put(validatedTransaction)

      return {
        ...validatedTransaction,
        _rev: response.rev
      }
    } catch (error) {
      console.error('Error creating transaction:', error)
      throw error
    }
  }

  async updateTransaction(id: string, updates: UpdateTransaction): Promise<Transaction> {
    try {
      const validatedUpdates = updateTransactionSchema.parse(updates)

      const existingTransaction = await this.db.transactions.get(id)

      const updatedTransaction: Transaction = {
        ...existingTransaction,
        ...validatedUpdates,
        updatedAt: new Date().toISOString()
      }

      const validatedTransaction = transactionSchema.parse(updatedTransaction)

      const response = await this.db.transactions.put(validatedTransaction)

      return {
        ...validatedTransaction,
        _rev: response.rev
      }
    } catch (error) {
      console.error('Error updating transaction:', error)
      throw error
    }
  }

  async deleteTransaction(id: string): Promise<void> {
    try {
      const transaction = await this.db.transactions.get(id)
      await this.db.transactions.remove(transaction)
    } catch (error) {
      console.error('Error deleting transaction:', error)
      throw error
    }
  }

  async getWalletBalance(walletId: string): Promise<number> {
    try {
      const transactions = await this.getTransactionsByWallet(walletId)
      let balance = 0

      for (const transaction of transactions) {
        if (transaction.walletId === walletId) {
          if (transaction.transactionType === 'income') {
            balance += transaction.amount
          } else if (transaction.transactionType === 'expense') {
            balance -= transaction.amount
          } else if (transaction.transactionType === 'transfer') {
            balance -= transaction.amount
          }
        }

        if (transaction.toWalletId === walletId && transaction.transactionType === 'transfer') {
          balance += transaction.amount
        }
      }

      return balance
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
