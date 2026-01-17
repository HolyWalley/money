import { db } from '../lib/db-dexie'
import {
  addRecurringPayment,
  updateRecurringPayment,
  deleteRecurringPayment,
  addRecurringPaymentLog,
  addTransaction,
  updateTransaction,
} from '../lib/crdts'
import { generateLogId } from '../lib/recurring-utils'
import type { RecurringPayment, CreateRecurringPayment, RecurringPaymentLog } from '../../shared/schemas/recurring-payment.schema'
import type { Transaction, CreateTransaction } from '../../shared/schemas/transaction.schema'
import { createRecurringPaymentSchema, updateRecurringPaymentSchema } from '../../shared/schemas/recurring-payment.schema'

class RecurringPaymentService {
  async getRecurringPaymentById(id: string): Promise<RecurringPayment | null> {
    try {
      const payment = await db.recurringPayments.get(id)
      if (!payment) return null
      return {
        ...payment,
        startDate: payment.startDate.toISOString(),
        endDate: payment.endDate?.toISOString(),
        createdAt: payment.createdAt.toISOString(),
        updatedAt: payment.updatedAt.toISOString()
      } as RecurringPayment
    } catch (error) {
      console.error('Error fetching recurring payment:', error)
      throw error
    }
  }

  async createRecurringPayment(data: CreateRecurringPayment): Promise<RecurringPayment> {
    try {
      const validatedData = createRecurringPaymentSchema.parse(data)

      const id = addRecurringPayment({
        amount: validatedData.amount,
        currency: validatedData.currency,
        categoryId: validatedData.categoryId,
        walletId: validatedData.walletId,
        toWalletId: validatedData.toWalletId,
        transactionType: validatedData.transactionType,
        description: validatedData.description,
        rrule: validatedData.rrule,
        startDate: validatedData.startDate,
        endDate: validatedData.endDate,
        sourceTransactionId: validatedData.sourceTransactionId,
      })

      return {
        _id: id,
        ...validatedData,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    } catch (error) {
      console.error('Error creating recurring payment:', error)
      throw error
    }
  }

  async createFromTransaction(
    transactionId: string,
    rrule: string,
    startDate?: string
  ): Promise<RecurringPayment> {
    try {
      const transaction = await db.transactions.get(transactionId)
      if (!transaction) {
        throw new Error('Transaction not found')
      }

      const effectiveStartDate = startDate || transaction.date.toISOString()

      const data: CreateRecurringPayment = {
        amount: transaction.amount,
        currency: transaction.currency,
        categoryId: transaction.categoryId,
        walletId: transaction.walletId,
        toWalletId: transaction.toWalletId,
        transactionType: transaction.transactionType,
        description: transaction.note,
        rrule,
        startDate: effectiveStartDate,
        sourceTransactionId: transactionId,
      }

      const recurringPayment = await this.createRecurringPayment(data)

      const scheduledDate = new Date(effectiveStartDate)
      const logId = generateLogId(recurringPayment._id, scheduledDate)

      addRecurringPaymentLog({
        _id: logId,
        recurringPaymentId: recurringPayment._id,
        scheduledDate: scheduledDate.toISOString(),
        status: 'logged',
        transactionId,
      })

      updateTransaction(transactionId, {
        recurringPaymentLogId: logId,
      })

      return recurringPayment
    } catch (error) {
      console.error('Error creating recurring payment from transaction:', error)
      throw error
    }
  }

  async updateRecurringPaymentDetails(
    id: string,
    updates: Partial<RecurringPayment>
  ): Promise<RecurringPayment> {
    try {
      const validatedUpdates = updateRecurringPaymentSchema.parse(updates)

      const existing = await db.recurringPayments.get(id)
      if (!existing) {
        throw new Error('Recurring payment not found')
      }

      updateRecurringPayment(id, validatedUpdates)

      return {
        ...existing,
        ...validatedUpdates,
        startDate: validatedUpdates.startDate || existing.startDate.toISOString(),
        endDate: validatedUpdates.endDate || existing.endDate?.toISOString(),
        createdAt: existing.createdAt.toISOString(),
        updatedAt: new Date().toISOString()
      } as RecurringPayment
    } catch (error) {
      console.error('Error updating recurring payment:', error)
      throw error
    }
  }

  async deactivateRecurringPayment(id: string): Promise<void> {
    try {
      updateRecurringPayment(id, { isActive: false })
    } catch (error) {
      console.error('Error deactivating recurring payment:', error)
      throw error
    }
  }

  async deleteRecurringPaymentById(id: string): Promise<void> {
    try {
      deleteRecurringPayment(id)
    } catch (error) {
      console.error('Error deleting recurring payment:', error)
      throw error
    }
  }

  async logRecurringPayment(
    recurringPaymentId: string,
    scheduledDate: Date,
    transactionData: CreateTransaction
  ): Promise<{ transaction: Transaction; log: RecurringPaymentLog }> {
    try {
      const logId = generateLogId(recurringPaymentId, scheduledDate)

      const existingLog = await db.recurringPaymentLogs.get(logId)
      if (existingLog) {
        throw new Error('This occurrence has already been logged')
      }

      const transactionId = addTransaction({
        type: 'transaction',
        transactionType: transactionData.transactionType,
        amount: transactionData.amount,
        currency: transactionData.currency,
        toAmount: transactionData.toAmount,
        toCurrency: transactionData.toCurrency,
        note: transactionData.note,
        categoryId: transactionData.categoryId,
        walletId: transactionData.walletId,
        toWalletId: transactionData.toWalletId,
        date: transactionData.date,
        split: transactionData.split,
        parts: transactionData.parts,
        reimbursement: transactionData.reimbursement,
        recurringPaymentLogId: logId,
      })

      addRecurringPaymentLog({
        _id: logId,
        recurringPaymentId,
        scheduledDate: scheduledDate.toISOString(),
        status: 'logged',
        transactionId,
      })

      const transaction: Transaction = {
        _id: transactionId,
        type: 'transaction',
        ...transactionData,
        recurringPaymentLogId: logId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const log: RecurringPaymentLog = {
        _id: logId,
        recurringPaymentId,
        scheduledDate: scheduledDate.toISOString(),
        status: 'logged',
        transactionId,
        createdAt: new Date().toISOString(),
      }

      return { transaction, log }
    } catch (error) {
      console.error('Error logging recurring payment:', error)
      throw error
    }
  }

  async skipRecurringPayment(
    recurringPaymentId: string,
    scheduledDate: Date
  ): Promise<RecurringPaymentLog> {
    try {
      const logId = generateLogId(recurringPaymentId, scheduledDate)

      const existingLog = await db.recurringPaymentLogs.get(logId)
      if (existingLog) {
        throw new Error('This occurrence has already been processed')
      }

      addRecurringPaymentLog({
        _id: logId,
        recurringPaymentId,
        scheduledDate: scheduledDate.toISOString(),
        status: 'skipped',
      })

      return {
        _id: logId,
        recurringPaymentId,
        scheduledDate: scheduledDate.toISOString(),
        status: 'skipped',
        createdAt: new Date().toISOString(),
      }
    } catch (error) {
      console.error('Error skipping recurring payment:', error)
      throw error
    }
  }

  async getTransactionsForRecurring(recurringPaymentId: string): Promise<Transaction[]> {
    try {
      const logs = await db.recurringPaymentLogs
        .where('recurringPaymentId')
        .equals(recurringPaymentId)
        .filter(log => log.status === 'logged' && !!log.transactionId)
        .toArray()

      const transactionIds = logs.map(log => log.transactionId!).filter(Boolean)

      if (transactionIds.length === 0) {
        return []
      }

      const transactions = await db.transactions
        .where('_id')
        .anyOf(transactionIds)
        .toArray()

      return transactions.map(tx => ({
        ...tx,
        date: tx.date.toISOString(),
        createdAt: tx.createdAt.toISOString(),
        updatedAt: tx.updatedAt.toISOString()
      })) as Transaction[]
    } catch (error) {
      console.error('Error fetching transactions for recurring payment:', error)
      throw error
    }
  }
}

export const recurringPaymentService = new RecurringPaymentService()
