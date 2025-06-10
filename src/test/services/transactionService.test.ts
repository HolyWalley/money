import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TransactionService } from '../../services/transactionService'
import type { Database } from '../../lib/db'
import type { Transaction, CreateTransaction } from '../../../shared/schemas/transaction.schema'

describe('TransactionService', () => {
  let transactionService: TransactionService
  let mockDb: Database

  beforeEach(() => {
    mockDb = {
      transactions: {
        allDocs: vi.fn(),
        get: vi.fn(),
        put: vi.fn(),
        remove: vi.fn(),
      },
      wallets: {} as Database['wallets'],
      categories: {} as Database['categories'],
    } as unknown as Database

    transactionService = new TransactionService(mockDb)
  })

  describe('getAllTransactions', () => {
    it('should return all transactions', async () => {
      const mockTransactions: Transaction[] = [
        {
          _id: 'transaction_grocery_123',
          _rev: '1-abc',
          type: 'transaction',
          userId: 'user123',
          transactionType: 'expense',
          amount: 50.25,
          currency: 'USD',
          description: 'Grocery shopping',
          categoryId: 'category_food_123',
          walletId: 'wallet_cash_123',
          date: '2024-01-01T12:00:00.000Z',
          createdAt: '2024-01-01T12:00:00.000Z',
          updatedAt: '2024-01-01T12:00:00.000Z',
        },
        {
          _id: 'transaction_salary_456',
          _rev: '1-def',
          type: 'transaction',
          userId: 'user123',
          transactionType: 'income',
          amount: 3000,
          currency: 'USD',
          description: 'Monthly salary',
          categoryId: 'category_salary_456',
          walletId: 'wallet_bank_456',
          date: '2024-01-01T00:00:00.000Z',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ]

      vi.mocked(mockDb.transactions.allDocs).mockResolvedValue({
        rows: mockTransactions.map(doc => ({ doc })),
      } as PouchDB.Core.AllDocsResponse<Transaction>)

      const result = await transactionService.getAllTransactions()

      expect(mockDb.transactions.allDocs).toHaveBeenCalledWith({
        include_docs: true,
        descending: true,
      })
      expect(result).toEqual(mockTransactions)
    })

    it('should handle errors when fetching transactions', async () => {
      const error = new Error('Database error')
      vi.mocked(mockDb.transactions.allDocs).mockRejectedValue(error)

      await expect(transactionService.getAllTransactions()).rejects.toThrow('Database error')
    })
  })

  describe('getTransactionById', () => {
    it('should return a transaction by id', async () => {
      const mockTransaction: Transaction = {
        _id: 'transaction_grocery_123',
        _rev: '1-abc',
        type: 'transaction',
        userId: 'user123',
        transactionType: 'expense',
        amount: 50.25,
        currency: 'USD',
        description: 'Grocery shopping',
        categoryId: 'category_food_123',
        walletId: 'wallet_cash_123',
        date: '2024-01-01T12:00:00.000Z',
        createdAt: '2024-01-01T12:00:00.000Z',
        updatedAt: '2024-01-01T12:00:00.000Z',
      }

      vi.mocked(mockDb.transactions.get).mockResolvedValue(mockTransaction as PouchDB.Core.Document<Transaction>)

      const result = await transactionService.getTransactionById('transaction_grocery_123')

      expect(mockDb.transactions.get).toHaveBeenCalledWith('transaction_grocery_123')
      expect(result).toEqual(mockTransaction)
    })

    it('should return null when transaction not found', async () => {
      const error = { status: 404, message: 'missing' }
      vi.mocked(mockDb.transactions.get).mockRejectedValue(error)

      const result = await transactionService.getTransactionById('nonexistent')

      expect(result).toBeNull()
    })

    it('should throw error for non-404 errors', async () => {
      const error = new Error('Database error')
      vi.mocked(mockDb.transactions.get).mockRejectedValue(error)

      await expect(transactionService.getTransactionById('transaction_123')).rejects.toThrow('Database error')
    })
  })

  describe('getTransactionsByWallet', () => {
    it('should return transactions for a specific wallet', async () => {
      const mockTransactions: Transaction[] = [
        {
          _id: 'transaction_grocery_123',
          _rev: '1-abc',
          type: 'transaction',
          userId: 'user123',
          transactionType: 'expense',
          amount: 50.25,
          currency: 'USD',
          description: 'Grocery shopping',
          categoryId: 'category_food_123',
          walletId: 'wallet_cash_123',
          date: '2024-01-01T12:00:00.000Z',
          createdAt: '2024-01-01T12:00:00.000Z',
          updatedAt: '2024-01-01T12:00:00.000Z',
        },
        {
          _id: 'transaction_transfer_456',
          _rev: '1-def',
          type: 'transaction',
          userId: 'user123',
          transactionType: 'transfer',
          amount: 100,
          currency: 'USD',
          description: 'Transfer to savings',
          walletId: 'wallet_cash_123',
          toWalletId: 'wallet_savings_789',
          date: '2024-01-01T15:00:00.000Z',
          createdAt: '2024-01-01T15:00:00.000Z',
          updatedAt: '2024-01-01T15:00:00.000Z',
        },
        {
          _id: 'transaction_other_789',
          _rev: '1-ghi',
          type: 'transaction',
          userId: 'user123',
          transactionType: 'expense',
          amount: 25,
          currency: 'USD',
          description: 'Coffee',
          categoryId: 'category_food_123',
          walletId: 'wallet_bank_456',
          date: '2024-01-01T10:00:00.000Z',
          createdAt: '2024-01-01T10:00:00.000Z',
          updatedAt: '2024-01-01T10:00:00.000Z',
        },
      ]

      vi.mocked(mockDb.transactions.allDocs).mockResolvedValue({
        rows: mockTransactions.map(doc => ({ doc })),
      } as PouchDB.Core.AllDocsResponse<Transaction>)

      const result = await transactionService.getTransactionsByWallet('wallet_cash_123')

      expect(result).toHaveLength(2)
      expect(result[0]._id).toBe('transaction_grocery_123')
      expect(result[1]._id).toBe('transaction_transfer_456')
    })
  })

  describe('getTransactionsByCategory', () => {
    it('should return transactions for a specific category', async () => {
      const mockTransactions: Transaction[] = [
        {
          _id: 'transaction_grocery_123',
          _rev: '1-abc',
          type: 'transaction',
          userId: 'user123',
          transactionType: 'expense',
          amount: 50.25,
          currency: 'USD',
          description: 'Grocery shopping',
          categoryId: 'category_food_123',
          walletId: 'wallet_cash_123',
          date: '2024-01-01T12:00:00.000Z',
          createdAt: '2024-01-01T12:00:00.000Z',
          updatedAt: '2024-01-01T12:00:00.000Z',
        },
        {
          _id: 'transaction_coffee_456',
          _rev: '1-def',
          type: 'transaction',
          userId: 'user123',
          transactionType: 'expense',
          amount: 4.50,
          currency: 'USD',
          description: 'Morning coffee',
          categoryId: 'category_food_123',
          walletId: 'wallet_cash_123',
          date: '2024-01-01T08:00:00.000Z',
          createdAt: '2024-01-01T08:00:00.000Z',
          updatedAt: '2024-01-01T08:00:00.000Z',
        },
      ]

      vi.mocked(mockDb.transactions.allDocs).mockResolvedValue({
        rows: mockTransactions.map(doc => ({ doc })),
      } as PouchDB.Core.AllDocsResponse<Transaction>)

      const result = await transactionService.getTransactionsByCategory('category_food_123')

      expect(result).toHaveLength(2)
      expect(result.every(t => t.categoryId === 'category_food_123')).toBe(true)
    })
  })

  describe('getTransactionsByDateRange', () => {
    it('should return transactions within date range', async () => {
      const mockTransactions: Transaction[] = [
        {
          _id: 'transaction_1',
          _rev: '1-abc',
          type: 'transaction',
          userId: 'user123',
          transactionType: 'expense',
          amount: 50,
          currency: 'USD',
          description: 'Transaction 1',
          categoryId: 'category_123',
          walletId: 'wallet_123',
          date: '2024-01-15T12:00:00.000Z',
          createdAt: '2024-01-15T12:00:00.000Z',
          updatedAt: '2024-01-15T12:00:00.000Z',
        },
        {
          _id: 'transaction_2',
          _rev: '1-def',
          type: 'transaction',
          userId: 'user123',
          transactionType: 'expense',
          amount: 25,
          currency: 'USD',
          description: 'Transaction 2',
          categoryId: 'category_123',
          walletId: 'wallet_123',
          date: '2024-02-15T12:00:00.000Z',
          createdAt: '2024-02-15T12:00:00.000Z',
          updatedAt: '2024-02-15T12:00:00.000Z',
        },
      ]

      vi.mocked(mockDb.transactions.allDocs).mockResolvedValue({
        rows: mockTransactions.map(doc => ({ doc })),
      } as PouchDB.Core.AllDocsResponse<Transaction>)

      const result = await transactionService.getTransactionsByDateRange(
        '2024-01-01T00:00:00.000Z',
        '2024-01-31T23:59:59.999Z'
      )

      expect(result).toHaveLength(1)
      expect(result[0]._id).toBe('transaction_1')
    })
  })

  describe('createTransaction', () => {
    it('should create a new expense transaction', async () => {
      const createData: CreateTransaction = {
        transactionType: 'expense',
        amount: 75.50,
        currency: 'USD',
        description: 'Dinner at restaurant',
        categoryId: 'category_food_123',
        walletId: 'wallet_cash_123',
        date: '2024-01-01T19:00:00.000Z',
      }

      vi.mocked(mockDb.transactions.put).mockResolvedValue({
        ok: true,
        id: 'transaction_dinner_at_restaurant_123',
        rev: '1-xyz',
      })

      const result = await transactionService.createTransaction('user123', createData)

      expect(mockDb.transactions.put).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: expect.stringContaining('transaction_dinner_at_restaurant_'),
          type: 'transaction',
          userId: 'user123',
          transactionType: 'expense',
          amount: 75.50,
          currency: 'USD',
          description: 'Dinner at restaurant',
          categoryId: 'category_food_123',
          walletId: 'wallet_cash_123',
          date: '2024-01-01T19:00:00.000Z',
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        })
      )

      expect(result).toMatchObject({
        type: 'transaction',
        userId: 'user123',
        transactionType: 'expense',
        amount: 75.50,
        _rev: '1-xyz',
      })
    })

    it('should create a new transfer transaction', async () => {
      const createData: CreateTransaction = {
        transactionType: 'transfer',
        amount: 200,
        currency: 'USD',
        description: 'Transfer to savings',
        walletId: 'wallet_checking_123',
        toWalletId: 'wallet_savings_456',
        date: '2024-01-01T10:00:00.000Z',
      }

      vi.mocked(mockDb.transactions.put).mockResolvedValue({
        ok: true,
        id: 'transaction_transfer_to_savings_123',
        rev: '1-abc',
      })

      const result = await transactionService.createTransaction('user123', createData)

      expect(result.transactionType).toBe('transfer')
      expect(result.toWalletId).toBe('wallet_savings_456')
    })

    it('should validate transfer transactions require toWalletId', async () => {
      const invalidData = {
        transactionType: 'transfer',
        amount: 100,
        currency: 'USD',
        description: 'Invalid transfer',
        walletId: 'wallet_123',
        date: '2024-01-01T10:00:00.000Z',
      } as CreateTransaction

      await expect(transactionService.createTransaction('user123', invalidData)).rejects.toThrow()
    })

    it('should validate income/expense transactions require categoryId', async () => {
      const invalidData = {
        transactionType: 'expense',
        amount: 50,
        currency: 'USD',
        description: 'Invalid expense',
        walletId: 'wallet_123',
        date: '2024-01-01T10:00:00.000Z',
      } as CreateTransaction

      await expect(transactionService.createTransaction('user123', invalidData)).rejects.toThrow()
    })

    it('should validate positive amounts', async () => {
      const invalidData = {
        transactionType: 'expense',
        amount: -50,
        currency: 'USD',
        description: 'Negative amount',
        categoryId: 'category_123',
        walletId: 'wallet_123',
        date: '2024-01-01T10:00:00.000Z',
      } as CreateTransaction

      await expect(transactionService.createTransaction('user123', invalidData)).rejects.toThrow()
    })
  })

  describe('updateTransaction', () => {
    it('should update an existing transaction', async () => {
      const existingTransaction: Transaction = {
        _id: 'transaction_grocery_123',
        _rev: '1-abc',
        type: 'transaction',
        userId: 'user123',
        transactionType: 'expense',
        amount: 50.25,
        currency: 'USD',
        description: 'Grocery shopping',
        categoryId: 'category_food_123',
        walletId: 'wallet_cash_123',
        date: '2024-01-01T12:00:00.000Z',
        createdAt: '2024-01-01T12:00:00.000Z',
        updatedAt: '2024-01-01T12:00:00.000Z',
      }

      vi.mocked(mockDb.transactions.get).mockResolvedValue(existingTransaction as PouchDB.Core.Document<Transaction>)
      vi.mocked(mockDb.transactions.put).mockResolvedValue({
        ok: true,
        id: 'transaction_grocery_123',
        rev: '2-def',
      })

      const result = await transactionService.updateTransaction('transaction_grocery_123', {
        amount: 55.75,
        description: 'Weekly grocery shopping',
      })

      expect(mockDb.transactions.put).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: 'transaction_grocery_123',
          amount: 55.75,
          description: 'Weekly grocery shopping',
          updatedAt: expect.any(String),
        })
      )

      expect(result).toMatchObject({
        amount: 55.75,
        description: 'Weekly grocery shopping',
        _rev: '2-def',
      })
    })
  })

  describe('deleteTransaction', () => {
    it('should delete a transaction', async () => {
      const transaction: Transaction = {
        _id: 'transaction_grocery_123',
        _rev: '1-abc',
        type: 'transaction',
        userId: 'user123',
        transactionType: 'expense',
        amount: 50.25,
        currency: 'USD',
        description: 'Grocery shopping',
        categoryId: 'category_food_123',
        walletId: 'wallet_cash_123',
        date: '2024-01-01T12:00:00.000Z',
        createdAt: '2024-01-01T12:00:00.000Z',
        updatedAt: '2024-01-01T12:00:00.000Z',
      }

      vi.mocked(mockDb.transactions.get).mockResolvedValue(transaction as PouchDB.Core.Document<Transaction>)
      vi.mocked(mockDb.transactions.remove).mockResolvedValue({
        ok: true,
        id: 'transaction_grocery_123',
        rev: '2-def',
      })

      await transactionService.deleteTransaction('transaction_grocery_123')

      expect(mockDb.transactions.get).toHaveBeenCalledWith('transaction_grocery_123')
      expect(mockDb.transactions.remove).toHaveBeenCalledWith(transaction)
    })
  })

  describe('getWalletBalance', () => {
    it('should calculate wallet balance correctly', async () => {
      const mockTransactions: Transaction[] = [
        {
          _id: 'transaction_income_123',
          _rev: '1-abc',
          type: 'transaction',
          userId: 'user123',
          transactionType: 'income',
          amount: 1000,
          currency: 'USD',
          description: 'Salary',
          categoryId: 'category_salary_123',
          walletId: 'wallet_123',
          date: '2024-01-01T00:00:00.000Z',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          _id: 'transaction_expense_456',
          _rev: '1-def',
          type: 'transaction',
          userId: 'user123',
          transactionType: 'expense',
          amount: 200,
          currency: 'USD',
          description: 'Groceries',
          categoryId: 'category_food_123',
          walletId: 'wallet_123',
          date: '2024-01-01T12:00:00.000Z',
          createdAt: '2024-01-01T12:00:00.000Z',
          updatedAt: '2024-01-01T12:00:00.000Z',
        },
        {
          _id: 'transaction_transfer_out_789',
          _rev: '1-ghi',
          type: 'transaction',
          userId: 'user123',
          transactionType: 'transfer',
          amount: 100,
          currency: 'USD',
          description: 'Transfer to savings',
          walletId: 'wallet_123',
          toWalletId: 'wallet_savings_456',
          date: '2024-01-01T15:00:00.000Z',
          createdAt: '2024-01-01T15:00:00.000Z',
          updatedAt: '2024-01-01T15:00:00.000Z',
        },
        {
          _id: 'transaction_transfer_in_012',
          _rev: '1-jkl',
          type: 'transaction',
          userId: 'user123',
          transactionType: 'transfer',
          amount: 50,
          currency: 'USD',
          description: 'Transfer from checking',
          walletId: 'wallet_checking_789',
          toWalletId: 'wallet_123',
          date: '2024-01-01T16:00:00.000Z',
          createdAt: '2024-01-01T16:00:00.000Z',
          updatedAt: '2024-01-01T16:00:00.000Z',
        },
      ]

      vi.mocked(mockDb.transactions.allDocs).mockResolvedValue({
        rows: mockTransactions.map(doc => ({ doc })),
      } as PouchDB.Core.AllDocsResponse<Transaction>)

      const balance = await transactionService.getWalletBalance('wallet_123')

      expect(balance).toBe(750)
    })
  })

  describe('getCategoryTotal', () => {
    it('should calculate category total correctly', async () => {
      const mockTransactions: Transaction[] = [
        {
          _id: 'transaction_1',
          _rev: '1-abc',
          type: 'transaction',
          userId: 'user123',
          transactionType: 'expense',
          amount: 50,
          currency: 'USD',
          description: 'Lunch',
          categoryId: 'category_food_123',
          walletId: 'wallet_123',
          date: '2024-01-01T12:00:00.000Z',
          createdAt: '2024-01-01T12:00:00.000Z',
          updatedAt: '2024-01-01T12:00:00.000Z',
        },
        {
          _id: 'transaction_2',
          _rev: '1-def',
          type: 'transaction',
          userId: 'user123',
          transactionType: 'expense',
          amount: 75,
          currency: 'USD',
          description: 'Dinner',
          categoryId: 'category_food_123',
          walletId: 'wallet_123',
          date: '2024-01-01T19:00:00.000Z',
          createdAt: '2024-01-01T19:00:00.000Z',
          updatedAt: '2024-01-01T19:00:00.000Z',
        },
      ]

      vi.mocked(mockDb.transactions.allDocs).mockResolvedValue({
        rows: mockTransactions.map(doc => ({ doc })),
      } as PouchDB.Core.AllDocsResponse<Transaction>)

      const total = await transactionService.getCategoryTotal('category_food_123')

      expect(total).toBe(125)
    })

    it('should filter by date range when provided', async () => {
      const mockTransactions: Transaction[] = [
        {
          _id: 'transaction_1',
          _rev: '1-abc',
          type: 'transaction',
          userId: 'user123',
          transactionType: 'expense',
          amount: 50,
          currency: 'USD',
          description: 'Lunch',
          categoryId: 'category_food_123',
          walletId: 'wallet_123',
          date: '2024-01-15T12:00:00.000Z',
          createdAt: '2024-01-15T12:00:00.000Z',
          updatedAt: '2024-01-15T12:00:00.000Z',
        },
        {
          _id: 'transaction_2',
          _rev: '1-def',
          type: 'transaction',
          userId: 'user123',
          transactionType: 'expense',
          amount: 75,
          currency: 'USD',
          description: 'Dinner',
          categoryId: 'category_food_123',
          walletId: 'wallet_123',
          date: '2024-02-15T19:00:00.000Z',
          createdAt: '2024-02-15T19:00:00.000Z',
          updatedAt: '2024-02-15T19:00:00.000Z',
        },
      ]

      vi.mocked(mockDb.transactions.allDocs).mockResolvedValue({
        rows: mockTransactions.map(doc => ({ doc })),
      } as PouchDB.Core.AllDocsResponse<Transaction>)

      const total = await transactionService.getCategoryTotal(
        'category_food_123',
        '2024-01-01T00:00:00.000Z',
        '2024-01-31T23:59:59.999Z'
      )

      expect(total).toBe(50)
    })
  })
})
