import { describe, it, expect, beforeEach, vi } from 'vitest'
import { WalletService } from '../../services/walletService'
import type { Database } from '../../lib/db'
import type { Wallet, CreateWallet } from '../../../shared/schemas/wallet.schema'

describe('WalletService', () => {
  let walletService: WalletService
  let mockDb: Database

  beforeEach(() => {
    mockDb = {
      wallets: {
        allDocs: vi.fn(),
        get: vi.fn(),
        put: vi.fn(),
        remove: vi.fn(),
      },
      categories: {} as any,
    } as unknown as Database

    walletService = new WalletService(mockDb)
  })

  describe('getAllWallets', () => {
    it('should return all wallets', async () => {
      const mockWallets: Wallet[] = [
        {
          _id: 'wallet_cash_123',
          _rev: '1-abc',
          type: 'wallet',
          userId: 'user123',
          name: 'Cash',
          currency: 'USD',
          initialBalance: 100,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          _id: 'wallet_bank_456',
          _rev: '1-def',
          type: 'wallet',
          userId: 'user123',
          name: 'Bank Account',
          currency: 'EUR',
          initialBalance: 1000,
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ]

      vi.mocked(mockDb.wallets.allDocs).mockResolvedValue({
        rows: mockWallets.map(doc => ({ doc })),
      } as any)

      const result = await walletService.getAllWallets()

      expect(mockDb.wallets.allDocs).toHaveBeenCalledWith({
        include_docs: true,
        descending: true,
      })
      expect(result).toEqual(mockWallets)
    })

    it('should handle errors when fetching wallets', async () => {
      const error = new Error('Database error')
      vi.mocked(mockDb.wallets.allDocs).mockRejectedValue(error)

      await expect(walletService.getAllWallets()).rejects.toThrow('Database error')
    })
  })

  describe('getWalletById', () => {
    it('should return a wallet by id', async () => {
      const mockWallet: Wallet = {
        _id: 'wallet_cash_123',
        _rev: '1-abc',
        type: 'wallet',
        userId: 'user123',
        name: 'Cash',
        currency: 'USD',
        initialBalance: 100,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }

      vi.mocked(mockDb.wallets.get).mockResolvedValue(mockWallet as any)

      const result = await walletService.getWalletById('wallet_cash_123')

      expect(mockDb.wallets.get).toHaveBeenCalledWith('wallet_cash_123')
      expect(result).toEqual(mockWallet)
    })

    it('should return null when wallet not found', async () => {
      const error = { status: 404, message: 'missing' }
      vi.mocked(mockDb.wallets.get).mockRejectedValue(error)

      const result = await walletService.getWalletById('nonexistent')

      expect(result).toBeNull()
    })

    it('should throw error for non-404 errors', async () => {
      const error = new Error('Database error')
      vi.mocked(mockDb.wallets.get).mockRejectedValue(error)

      await expect(walletService.getWalletById('wallet_123')).rejects.toThrow('Database error')
    })
  })

  describe('createWallet', () => {
    it('should create a new wallet', async () => {
      const createData: CreateWallet = {
        name: 'Savings Account',
        currency: 'USD',
        initialBalance: 500,
      }

      vi.mocked(mockDb.wallets.put).mockResolvedValue({
        ok: true,
        id: 'wallet_savings_account_123',
        rev: '1-xyz',
      })

      const result = await walletService.createWallet('user123', createData)

      expect(mockDb.wallets.put).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: expect.stringContaining('wallet_savings_account_'),
          type: 'wallet',
          userId: 'user123',
          name: 'Savings Account',
          currency: 'USD',
          initialBalance: 500,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        })
      )

      expect(result).toMatchObject({
        type: 'wallet',
        userId: 'user123',
        name: 'Savings Account',
        currency: 'USD',
        initialBalance: 500,
        _rev: '1-xyz',
      })
    })

    it('should validate input data', async () => {
      const invalidData = {
        name: '',
        currency: 'USD',
        initialBalance: 100,
      } as CreateWallet

      await expect(walletService.createWallet('user123', invalidData)).rejects.toThrow()
    })

    it('should sanitize wallet names for IDs', async () => {
      const createData: CreateWallet = {
        name: 'My Cash & Coins!',
        currency: 'EUR',
        initialBalance: 0,
      }

      vi.mocked(mockDb.wallets.put).mockResolvedValue({
        ok: true,
        id: 'wallet_my_cash_coins_123',
        rev: '1-abc',
      })

      await walletService.createWallet('user123', createData)

      expect(mockDb.wallets.put).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: expect.stringMatching(/^wallet_my_cash_coins__\d+$/),
        })
      )
    })
  })

  describe('updateWallet', () => {
    it('should update an existing wallet', async () => {
      const existingWallet: Wallet = {
        _id: 'wallet_cash_123',
        _rev: '1-abc',
        type: 'wallet',
        userId: 'user123',
        name: 'Cash',
        currency: 'USD',
        initialBalance: 100,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }

      vi.mocked(mockDb.wallets.get).mockResolvedValue(existingWallet as any)
      vi.mocked(mockDb.wallets.put).mockResolvedValue({
        ok: true,
        id: 'wallet_cash_123',
        rev: '2-def',
      })

      const result = await walletService.updateWallet('wallet_cash_123', {
        name: 'Cash Wallet',
      })

      expect(mockDb.wallets.put).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: 'wallet_cash_123',
          name: 'Cash Wallet',
          currency: 'USD',
          updatedAt: expect.any(String),
        })
      )

      expect(result).toMatchObject({
        name: 'Cash Wallet',
        _rev: '2-def',
      })
    })

    it('should validate update data', async () => {
      const existingWallet: Wallet = {
        _id: 'wallet_cash_123',
        _rev: '1-abc',
        type: 'wallet',
        userId: 'user123',
        name: 'Cash',
        currency: 'USD',
        initialBalance: 100,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }

      vi.mocked(mockDb.wallets.get).mockResolvedValue(existingWallet as any)

      const invalidUpdate = {
        currency: 'INVALID' as any,
      }

      await expect(walletService.updateWallet('wallet_cash_123', invalidUpdate)).rejects.toThrow()
    })
  })

  describe('deleteWallet', () => {
    it('should delete a wallet', async () => {
      const wallet: Wallet = {
        _id: 'wallet_cash_123',
        _rev: '1-abc',
        type: 'wallet',
        userId: 'user123',
        name: 'Cash',
        currency: 'USD',
        initialBalance: 100,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }

      vi.mocked(mockDb.wallets.get).mockResolvedValue(wallet as any)
      vi.mocked(mockDb.wallets.remove).mockResolvedValue({
        ok: true,
        id: 'wallet_cash_123',
        rev: '2-def',
      })

      await walletService.deleteWallet('wallet_cash_123')

      expect(mockDb.wallets.get).toHaveBeenCalledWith('wallet_cash_123')
      expect(mockDb.wallets.remove).toHaveBeenCalledWith(wallet)
    })

    it('should handle errors when deleting', async () => {
      const error = new Error('Not found')
      vi.mocked(mockDb.wallets.get).mockRejectedValue(error)

      await expect(walletService.deleteWallet('nonexistent')).rejects.toThrow('Not found')
    })
  })
})
