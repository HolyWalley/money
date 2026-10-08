import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../lib/crdts', () => ({
  dismissBankOperation: vi.fn(),
  getBankAccountWallets: vi.fn(() => ({ 'mbank:12345678/PLN': 'w1' })),
  getDismissedBankOperations: vi.fn(() => []),
  setBankAccountWallet: vi.fn(),
}))

vi.mock('./transactionService', () => ({
  transactionService: {
    createTransaction: vi.fn(async () => ({})),
    updateTransaction: vi.fn(async () => ({})),
    getAllTransactions: vi.fn(async () => []),
  },
}))

vi.mock('../lib/api-client', () => ({
  apiClient: {
    getBankNotifications: vi.fn(),
    removeBankNotifications: vi.fn(async () => ({ ok: true, status: 200, data: { removed: 1 } })),
    createInboxAddress: vi.fn(),
    setInboxForwarder: vi.fn(),
  },
}))

import { apiClient } from '../lib/api-client'
import { dismissBankOperation, getDismissedBankOperations, setBankAccountWallet } from '../lib/crdts'
import { parseBankDocuments } from '../lib/bank-import'
import type { ReviewItem } from '../lib/bank-import/match'
import { bankImportService } from './bankImportService'
import { transactionService } from './transactionService'
import type { Wallet } from '../../shared/schemas/wallet.schema'
import type { Transaction } from '../../shared/schemas/transaction.schema'

const getBankNotifications = vi.mocked(apiClient.getBankNotifications)
const removeBankNotifications = vi.mocked(apiClient.removeBankNotifications)
const createInboxAddress = vi.mocked(apiClient.createInboxAddress)
const setInboxForwarder = vi.mocked(apiClient.setInboxForwarder)

function item(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    operation: {
      externalId: 'mbank:1',
      bank: 'mbank',
      account: 'mbank:12345678',
      date: '2026-10-04T11:13:00.000Z',
      direction: 'expense',
      amount: 116,
      currency: 'PLN',
      counterparty: 'ANNA NOWAK',
      title: 'CZYNSZ',
      description: 'row',
      suggestTransfer: false,
    linkedExternalIds: [],
    },
    ...overrides,
  }
}

function document() {
  return { bank: 'mbank' as const, messageId: '1', receivedAt: '2026-10-05T05:50:51Z', filename: 'a.htm', content: notification() }
}

function notification(): string {
  return btoa(`<html><body><h1>2026-10-04 - Powiadomienie</h1>
    <table><tr><th>Czas operacji</th><th>Opis operacji</th></tr>
    <tr><td>13:13</td><td>mBank: Przelew wych. z rach. 12345678 na rach. 59...66 kwota 116,00 PLN dla ANNA NOWAK; CZYNSZ; Dost. 214,10 PLN</td></tr>
    </table></body></html>`)
}

describe('bankImportService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchOperations', () => {
    it('parses the documents the server returns', async () => {
      getBankNotifications.mockResolvedValue({
        ok: true,
        status: 200,
        data: { documents: [document()], notices: [], address: 'abcdefghjkmnpqrs@in.example.com', forwarder: null },
      })

      const outcome = await bankImportService.fetchOperations()

      expect(outcome.ok && outcome.parsed.operations.map((operation) => operation.amount)).toEqual([116])
      expect(outcome.ok && outcome.address).toBe('abcdefghjkmnpqrs@in.example.com')
      expect(removeBankNotifications).not.toHaveBeenCalled()
    })

    it('drops the messages whose operations were all dealt with before', async () => {
      const [operation] = parseBankDocuments([document()]).operations
      vi.mocked(getDismissedBankOperations).mockReturnValueOnce([operation.externalId])
      getBankNotifications.mockResolvedValue({
        ok: true,
        status: 200,
        data: { documents: [document()], notices: [], address: null, forwarder: null },
      })

      await bankImportService.fetchOperations()

      await vi.waitFor(() => expect(removeBankNotifications).toHaveBeenCalledWith(['1']))
    })

    it('answers with the server reason instead of rejecting', async () => {
      getBankNotifications.mockResolvedValue({
        ok: false,
        status: 503,
        failure: 'server',
        error: 'The mail provider token has expired',
      })

      expect(await bankImportService.fetchOperations()).toEqual({
        ok: false,
        error: 'The mail provider token has expired',
      })
    })
  })

  describe('countPending', () => {
    it('counts the operations not yet in the ledger, and the notices', async () => {
      getBankNotifications.mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          documents: [document()],
          notices: [{ messageId: 'g1', receivedAt: '', sender: 's', subject: '', text: '' }],
          address: null,
          forwarder: null,
        },
      })

      expect(await bankImportService.countPending()).toBe(2)
    })

    it('leaves out what was already imported', async () => {
      const [operation] = parseBankDocuments([document()]).operations
      const imported = [{ externalId: operation.externalId } as Transaction]
      // Read twice: once to clear settled mail, once to count.
      vi.mocked(transactionService.getAllTransactions).mockResolvedValueOnce(imported).mockResolvedValueOnce(imported)
      getBankNotifications.mockResolvedValue({
        ok: true,
        status: 200,
        data: { documents: [document()], notices: [], address: null, forwarder: null },
      })

      expect(await bankImportService.countPending()).toBe(0)
    })

    it('answers null when the inbox cannot be read', async () => {
      getBankNotifications.mockResolvedValue({ ok: false, status: 0, failure: 'network', error: 'offline' })

      expect(await bankImportService.countPending()).toBeNull()
    })
  })

  describe('createAddress', () => {
    it('answers with the new address', async () => {
      createInboxAddress.mockResolvedValue({ ok: true, status: 200, data: { address: 'a@in.example.com' } })

      expect(await bankImportService.createAddress()).toEqual({ ok: true, address: 'a@in.example.com' })
    })

    it('answers with the server reason instead of rejecting', async () => {
      createInboxAddress.mockResolvedValue({ ok: false, status: 503, failure: 'server', error: 'Not set up' })

      expect(await bankImportService.createAddress()).toEqual({ ok: false, error: 'Not set up' })
    })
  })

  describe('setForwarder', () => {
    it('answers with the saved mailbox', async () => {
      setInboxForwarder.mockResolvedValue({ ok: true, status: 200, data: { forwarder: 'me@hey.com' } })

      expect(await bankImportService.setForwarder('me@hey.com')).toEqual({ ok: true, forwarder: 'me@hey.com' })
      expect(setInboxForwarder).toHaveBeenCalledWith('me@hey.com')
    })

    it('answers with the server reason instead of rejecting', async () => {
      setInboxForwarder.mockResolvedValue({ ok: false, status: 422, failure: 'server', error: 'Invalid' })

      expect(await bankImportService.setForwarder('nope')).toEqual({ ok: false, error: 'Invalid' })
    })
  })

  describe('dismissNotice', () => {
    it('removes the notice from the inbox', async () => {
      expect(await bankImportService.dismissNotice('g1')).toBe(true)
      expect(removeBankNotifications).toHaveBeenCalledWith(['g1'])
    })
  })

  describe('review', () => {
    it('prefills the wallet stored for the account', () => {
      const parsed = { operations: [item().operation], unreadable: [] }

      const [reviewed] = bankImportService.review(parsed, [], [{ _id: 'w1' } as Wallet])

      expect(reviewed.walletId).toBe('w1')
    })
  })

  describe('save', () => {
    it('creates a transaction and remembers the wallet for the account', async () => {
      const summary = await bankImportService.save([
        { item: item(), action: 'import', walletId: 'w2', categoryId: 'c1' },
      ])

      expect(transactionService.createTransaction).toHaveBeenCalledWith({
        transactionType: 'expense',
        amount: 116,
        currency: 'PLN',
        note: 'ANNA NOWAK; CZYNSZ',
        categoryId: 'c1',
        walletId: 'w2',
        toWalletId: undefined,
        toCurrency: undefined,
        toAmount: undefined,
        date: '2026-10-04T11:13:00.000Z',
        externalId: 'mbank:1',
      })
      expect(setBankAccountWallet).toHaveBeenCalledWith('mbank:12345678/PLN', 'w2')
      expect(summary).toEqual({ imported: 1, logged: 0 })
    })

    it('creates a transfer when the row was imported as one', async () => {
      await bankImportService.save([
        {
          item: item(),
          action: 'import',
          walletId: 'w1',
          categoryId: 'transfer-misc',
          transfer: { toWalletId: 'w2', toCurrency: 'EUR', toAmount: 27.5 },
        },
      ])

      expect(transactionService.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionType: 'transfer',
          walletId: 'w1',
          toWalletId: 'w2',
          toCurrency: 'EUR',
          toAmount: 27.5,
          categoryId: 'transfer-misc',
        })
      )
    })

    it('remembers both wallets of an exchange and settles its folded side', async () => {
      const exchange = item({
        operation: {
          ...item().operation,
          account: 'pko:31..0034',
          currency: 'EUR',
          received: { account: 'pko:73..7365', amount: 1300, currency: 'PLN' },
          linkedExternalIds: ['pko:in'],
        },
      })

      await bankImportService.save([
        { item: exchange, action: 'import', walletId: 'w1', categoryId: 'c3', transfer: { toWalletId: 'w2', toCurrency: 'PLN', toAmount: 1300 } },
      ])

      expect(setBankAccountWallet).toHaveBeenCalledWith('pko:31..0034/EUR', 'w1')
      expect(setBankAccountWallet).toHaveBeenCalledWith('pko:73..7365/PLN', 'w2')
      expect(dismissBankOperation).toHaveBeenCalledWith('pko:in')
    })

    it('links an operation to the hand-entered transaction it matched', async () => {
      const summary = await bankImportService.save([{ item: item({ matchedTransactionId: 't1' }), action: 'logged' }])

      expect(transactionService.updateTransaction).toHaveBeenCalledWith('t1', { externalId: 'mbank:1' })
      expect(dismissBankOperation).not.toHaveBeenCalled()
      expect(transactionService.createTransaction).not.toHaveBeenCalled()
      expect(summary).toEqual({ imported: 0, logged: 1 })
    })

    it('drops the messages it settled from the inbox', async () => {
      const [operation] = parseBankDocuments([document()]).operations

      await bankImportService.save([{ item: item({ operation }), action: 'import', walletId: 'w1', categoryId: 'c1' }], [document()])

      expect(removeBankNotifications).toHaveBeenCalledWith(['1'])
    })

    it('keeps the messages with operations still undecided', async () => {
      await bankImportService.save([{ item: item(), action: 'import', walletId: 'w1', categoryId: 'c1' }], [document()])

      expect(removeBankNotifications).not.toHaveBeenCalled()
    })

    it('dismisses an operation marked as logged with nothing to link', async () => {
      await bankImportService.save([{ item: item(), action: 'logged' }])

      expect(dismissBankOperation).toHaveBeenCalledWith('mbank:1')
      expect(transactionService.updateTransaction).not.toHaveBeenCalled()
    })
  })
})
