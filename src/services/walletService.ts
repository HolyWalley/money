import { db } from '../lib/db-dexie'
import { addWallet, updateWallet, deleteWallet } from '../lib/crdts'
import type { Wallet, CreateWallet, UpdateWallet } from '../../shared/schemas/wallet.schema'
import { walletSchema, createWalletSchema, updateWalletSchema } from '../../shared/schemas/wallet.schema'

class WalletService {
  async getAllWallets(): Promise<Wallet[]> {
    try {
      return await db.wallets.orderBy('createdAt').reverse().toArray()
    } catch (error) {
      console.error('Error fetching wallets:', error)
      throw error
    }
  }

  async getWalletById(id: string): Promise<Wallet | null> {
    try {
      const wallet = await db.wallets.get(id)
      return wallet || null
    } catch (error) {
      console.error('Error fetching wallet:', error)
      throw error
    }
  }

  async createWallet(data: CreateWallet): Promise<Wallet> {
    try {
      const validatedData = createWalletSchema.parse(data)

      const wallet: Omit<Wallet, '_id'> = {
        type: 'wallet',
        ...validatedData,
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

      updateWallet(id, validatedUpdates)

      return {
        ...existingWallet,
        ...validatedUpdates,
        updatedAt: new Date().toISOString()
      }
    } catch (error) {
      console.error('Error updating wallet:', error)
      throw error
    }
  }

  async deleteWallet(id: string): Promise<void> {
    try {
      deleteWallet(id)
    } catch (error) {
      console.error('Error deleting wallet:', error)
      throw error
    }
  }
}

export const walletService = new WalletService()
