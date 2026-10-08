import { apiClient } from '../lib/api-client'
import { parseBankDocuments, settledMessageIds, type ParsedBankDocument } from '../lib/bank-import'
import { reviewOperations, type ReviewItem } from '../lib/bank-import/match'
import { accountWalletKey } from '../lib/bank-import/types'
import {
  dismissBankOperation,
  getBankAccountWallets,
  getDismissedBankOperations,
  setBankAccountWallet,
} from '../lib/crdts'
import { transactionService } from './transactionService'
import type { BankNotificationDocument, InboxNotice } from '../../shared/bank-notifications'
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
  | {
      ok: true
      parsed: ParsedBankDocument
      documents: BankNotificationDocument[]
      notices: InboxNotice[]
      address: string | null
      forwarder: string | null
    }
  | { ok: false; error: string }

export type InboxAddressOutcome = { ok: true; address: string } | { ok: false; error: string }

export type InboxForwarderOutcome = { ok: true; forwarder: string | null } | { ok: false; error: string }

export interface BankImportSummary {
  imported: number
  logged: number
}

class BankImportService {
  /**
   * Reads the bank notifications waiting in the inbox. They are parsed
   * straight from the response and kept nowhere but in the caller's memory;
   * the ones already dealt with are dropped from the inbox on the way.
   * Never rejects: the reason is shown to the person who asked.
   */
  async fetchOperations(): Promise<BankFetchOutcome> {
    const response = await apiClient.getBankNotifications()
    if (!response.ok || !response.data) {
      return { ok: false, error: response.error ?? 'The bank notifications could not be fetched' }
    }
    const { documents, notices, address, forwarder } = response.data
    let parsed: ParsedBankDocument
    try {
      parsed = parseBankDocuments(documents)
    } catch {
      return { ok: false, error: 'The bank notifications could not be read' }
    }
    void this.forgetSettled(documents)
    return { ok: true, parsed, documents, notices, address, forwarder }
  }

  /** Replaces the person's inbox address; the old one stops accepting mail. */
  async createAddress(): Promise<InboxAddressOutcome> {
    const response = await apiClient.createInboxAddress()
    if (!response.ok || !response.data) {
      return { ok: false, error: response.error ?? 'A new address could not be created' }
    }
    return { ok: true, address: response.data.address }
  }

  /** Lets the person's own mailbox pass notifications on; null stops it. */
  async setForwarder(forwarder: string | null): Promise<InboxForwarderOutcome> {
    const response = await apiClient.setInboxForwarder(forwarder)
    if (!response.ok || !response.data) {
      return { ok: false, error: response.error ?? 'The forwarding address could not be saved' }
    }
    return { ok: true, forwarder: response.data.forwarder }
  }

  async dismissNotice(messageId: string): Promise<boolean> {
    const response = await apiClient.removeBankNotifications([messageId])
    return response.ok
  }

  /**
   * Drops the messages nothing more can come of. Best effort: whatever is
   * missed here expires from the inbox on its own.
   */
  private async forgetSettled(documents: BankNotificationDocument[], alsoKnown: string[] = []): Promise<void> {
    try {
      const known = new Set([...getDismissedBankOperations(), ...alsoKnown])
      for (const transaction of await transactionService.getAllTransactions()) {
        if (transaction.externalId) known.add(transaction.externalId)
      }
      const settled = settledMessageIds(documents, known)
      if (settled.length > 0) await apiClient.removeBankNotifications(settled)
    } catch (error) {
      console.error('Failed to clear settled bank notifications:', error)
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

  async save(decisions: BankImportDecision[], documents: BankNotificationDocument[] = []): Promise<BankImportSummary> {
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

    // The transactions just written may not have reached the local store yet.
    const decided = decisions.flatMap(({ item }) => [item.operation.externalId, ...item.operation.linkedExternalIds])
    await this.forgetSettled(documents, decided)

    return summary
  }
}

export const bankImportService = new BankImportService()
