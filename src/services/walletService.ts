import type { Database } from '../lib/db'
import type { Wallet, CreateWallet, UpdateWallet } from '../../shared/schemas/wallet.schema'
import { walletSchema, createWalletSchema, updateWalletSchema } from '../../shared/schemas/wallet.schema'

export class WalletService {
  private db: Database

  constructor(db: Database) {
    this.db = db
  }

  async getAllWallets(): Promise<Wallet[]> {
    try {
      const result = await this.db.wallets.allDocs({
        include_docs: true,
        descending: true
      })

      const wallets: Wallet[] = []

      for (const row of result.rows) {
        if (row.doc) {
          wallets.push(row.doc)
        }
      }

      return wallets
    } catch (error) {
      console.error('Error fetching wallets:', error)
      throw error
    }
  }

  async getWalletById(id: string): Promise<Wallet | null> {
    try {
      const wallet = await this.db.wallets.get(id)
      return wallet
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        return null
      }
      console.error('Error fetching wallet:', error)
      throw error
    }
  }

  async createWallet(userId: string, data: CreateWallet): Promise<Wallet> {
    try {
      const validatedData = createWalletSchema.parse(data)

      const timestamp = Date.now().toString()
      const sanitizedName = validatedData.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')

      const wallet: Wallet = {
        _id: `wallet_${sanitizedName}_${timestamp}`,
        type: 'wallet',
        userId,
        ...validatedData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      const validatedWallet = walletSchema.parse(wallet)

      const response = await this.db.wallets.put(validatedWallet)

      return {
        ...validatedWallet,
        _rev: response.rev
      }
    } catch (error) {
      console.error('Error creating wallet:', error)
      throw error
    }
  }

  async updateWallet(id: string, updates: UpdateWallet): Promise<Wallet> {
    try {
      const validatedUpdates = updateWalletSchema.parse(updates)

      const existingWallet = await this.db.wallets.get(id)

      const updatedWallet: Wallet = {
        ...existingWallet,
        ...validatedUpdates,
        updatedAt: new Date().toISOString()
      }

      const validatedWallet = walletSchema.parse(updatedWallet)

      const response = await this.db.wallets.put(validatedWallet)

      return {
        ...validatedWallet,
        _rev: response.rev
      }
    } catch (error) {
      console.error('Error updating wallet:', error)
      throw error
    }
  }

  async deleteWallet(id: string): Promise<void> {
    try {
      const wallet = await this.db.wallets.get(id)
      await this.db.wallets.remove(wallet)
    } catch (error) {
      console.error('Error deleting wallet:', error)
      throw error
    }
  }
}
