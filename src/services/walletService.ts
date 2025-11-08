import { db } from '../lib/db-dexie'
import { addWallet, updateWallet as updateWalletCRDT, deleteWallet } from '../lib/crdts'
import type { Wallet, CreateWallet, UpdateWallet } from '../../shared/schemas/wallet.schema'
import { walletSchema, createWalletSchema, updateWalletSchema } from '../../shared/schemas/wallet.schema'

class WalletService {
  async getAllWallets(): Promise<Wallet[]> {
    try {
      const dexieWallets = await db.wallets.orderBy('order').toArray()
      // Convert Date objects back to ISO strings
      return dexieWallets.map(wallet => ({
        ...wallet,
        createdAt: wallet.createdAt.toISOString(),
        updatedAt: wallet.updatedAt.toISOString()
      })) as Wallet[]
    } catch (error) {
      console.error('Error fetching wallets:', error)
      throw error
    }
  }

  async getWalletById(id: string): Promise<Wallet | null> {
    try {
      const wallet = await db.wallets.get(id)
      if (!wallet) return null
      // Convert Date objects back to ISO strings
      return {
        ...wallet,
        createdAt: wallet.createdAt.toISOString(),
        updatedAt: wallet.updatedAt.toISOString()
      } as Wallet
    } catch (error) {
      console.error('Error fetching wallet:', error)
      throw error
    }
  }

  async createWallet(data: CreateWallet): Promise<Wallet> {
    try {
      const validatedData = createWalletSchema.parse(data)

      const maxOrder = await this.getMaxOrder()
      const order = validatedData.order ?? maxOrder + 1

      const wallet: Omit<Wallet, '_id'> = {
        type: 'wallet',
        ...validatedData,
        order,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      const validatedWallet = walletSchema.omit({ _id: true }).parse(wallet)

      const id = addWallet({
        ...validatedWallet
      })

      return {
        _id: id,
        ...validatedWallet
      }
    } catch (error) {
      console.error('Error creating wallet:', error)
      throw error
    }
  }

  async updateWallet(id: string, updates: UpdateWallet): Promise<Wallet> {
    try {
      const validatedUpdates = updateWalletSchema.parse(updates)

      const existingWallet = await db.wallets.get(id)
      if (!existingWallet) {
        throw new Error('Wallet not found')
      }

      updateWalletCRDT(id, validatedUpdates)

      // Convert Date objects back to ISO strings for return
      return {
        ...existingWallet,
        ...validatedUpdates,
        createdAt: existingWallet.createdAt.toISOString(),
        updatedAt: new Date().toISOString()
      } as Wallet
    } catch (error) {
      console.error('Error updating wallet:', error)
      throw error
    }
  }

  async getWalletTransactionCount(id: string): Promise<number> {
    try {
      return await db.transactions
        .filter(tx => tx.walletId === id || tx.toWalletId === id)
        .count()
    } catch (error) {
      console.error('Error getting wallet transaction count:', error)
      throw error
    }
  }

  async deleteWallet(id: string): Promise<void> {
    try {
      const { deleteTransaction } = await import('../lib/crdts')

      const transactions = await db.transactions
        .filter(tx => tx.walletId === id || tx.toWalletId === id)
        .toArray()

      for (const transaction of transactions) {
        deleteTransaction(transaction._id)
      }

      deleteWallet(id)
    } catch (error) {
      console.error('Error deleting wallet:', error)
      throw error
    }
  }

  private async getMaxOrder(): Promise<number> {
    try {
      const wallets = await db.wallets.orderBy('order').reverse().limit(1).toArray()
      return wallets.length > 0 ? wallets[0].order : -1
    } catch (error) {
      console.error('Error getting max order:', error)
      return -1
    }
  }

  async initializeWalletOrders(): Promise<void> {
    try {
      const wallets = await db.wallets.toArray()
      const walletsNeedingOrder = wallets.filter(wallet => 
        wallet.order === undefined || wallet.order === null
      )

      if (walletsNeedingOrder.length > 0) {
        for (let i = 0; i < walletsNeedingOrder.length; i++) {
          const wallet = walletsNeedingOrder[i]
          await this.updateWallet(wallet._id, { order: i })
        }
      }
    } catch (error) {
      console.error('Error initializing wallet orders:', error)
    }
  }
}

export const walletService = new WalletService()
