import { apiClient } from '../lib/api-client'
import { parseBankDocuments, type ParsedBankDocument } from '../lib/bank-import'
import { reviewOperations, type ReviewItem } from '../lib/bank-import/match'
import { accountWalletKey } from '../lib/bank-import/types'
import {
  dismissBankOperation,
  getBankAccountWallets,
  getDismissedBankOperations,
  setBankAccountWallet,
} from '../lib/crdts'
import { transactionService } from './transactionService'
import type { Transaction } from '../../shared/schemas/transaction.schema'
import type { Currency } from '../../shared/schemas/user_settings.schema'
import type { Wallet } from '../../shared/schemas/wallet.schema'

const NOTE_MAX_LENGTH = 200

export interface BankImportTransfer {
  toWalletId: string
  toCurrency: Currency
  /** What the other wallet received, when it counts in another currency. */
  toAmount?: number
}

export type BankImportDecision =
  | { item: ReviewItem; action: 'import'; walletId: string; categoryId: string; transfer?: BankImportTransfer }
  | { item: ReviewItem; action: 'logged' }

export type BankFetchOutcome =
  | { ok: true; parsed: ParsedBankDocument }
  | { ok: false; error: string }

export interface BankImportSummary {
  imported: number
  logged: number
}

class BankImportService {
  /**
   * Reads the bank notifications waiting in the mailbox. They are parsed
   * straight from the response and kept nowhere but in the caller's memory.
   * Never rejects: the reason is shown to the person who asked.
   */
  async fetchOperations(): Promise<BankFetchOutcome> {
    const response = await apiClient.getBankNotifications()
    if (!response.ok || !response.data) {
      return { ok: false, error: response.error ?? 'The bank notifications could not be fetched' }
    }
    try {
      return { ok: true, parsed: parseBankDocuments(response.data.documents) }
    } catch {
      return { ok: false, error: 'The bank notifications could not be read' }
    }
  }

  review(parsed: ParsedBankDocument, transactions: Transaction[], wallets: Wallet[]): ReviewItem[] {
    return reviewOperations(parsed.operations, {
      transactions,
      accountWallets: getBankAccountWallets(),
      dismissed: getDismissedBankOperations(),
      walletIds: wallets.map((wallet) => wallet._id),
    })
  }

  async save(decisions: BankImportDecision[]): Promise<BankImportSummary> {
    const summary: BankImportSummary = { imported: 0, logged: 0 }

    for (const decision of decisions) {
      const { operation, matchedTransactionId } = decision.item

      for (const linked of operation.linkedExternalIds) dismissBankOperation(linked)

      if (decision.action === 'logged') {
        // Linking the hand-entered record keeps it from being paired with a
        // later, identical operation; with nothing to link, the operation is
        // remembered as dismissed instead.
        if (matchedTransactionId) {
          await transactionService.updateTransaction(matchedTransactionId, { externalId: operation.externalId })
        } else {
          dismissBankOperation(operation.externalId)
        }
        summary.logged += 1
        continue
      }

      await transactionService.createTransaction({
        transactionType: decision.transfer ? 'transfer' : operation.direction,
        amount: operation.amount,
        currency: operation.currency as Currency,
        note: [operation.counterparty, operation.title].filter(Boolean).join('; ').slice(0, NOTE_MAX_LENGTH),
        categoryId: decision.categoryId,
        walletId: decision.walletId,
        toWalletId: decision.transfer?.toWalletId,
        toCurrency: decision.transfer?.toCurrency,
        toAmount: decision.transfer?.toAmount,
        date: operation.date,
        externalId: operation.externalId,
      })
      setBankAccountWallet(accountWalletKey(operation), decision.walletId)
      if (operation.received && decision.transfer) {
        setBankAccountWallet(accountWalletKey(operation.received), decision.transfer.toWalletId)
      }
      summary.imported += 1
    }

    return summary
  }
}

export const bankImportService = new BankImportService()
