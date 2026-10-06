import type { BankId } from '../../../shared/bank-notifications'

export interface BankOperation {
  /** Stable across re-reads of the same notification. */
  externalId: string
  bank: BankId
  /** Bank and account number as the notification gives it: 'mbank:84235780'. */
  account: string
  date: string
  direction: 'expense' | 'income'
  amount: number
  currency: string
  counterparty: string
  title: string
  /** The row as the bank wrote it. */
  description: string
  balanceAfter?: number
  /** The counterparty is one of the person's own accounts elsewhere, so a transfer is the likely truth. */
  suggestTransfer: boolean
}

/**
 * The key a wallet is remembered under. A multi-currency card charges a
 * different sub-account per currency, so the currency is part of it.
 */
export function accountWalletKey(operation: Pick<BankOperation, 'account' | 'currency'>): string {
  return `${operation.account}/${operation.currency}`
}

export interface ParsedBankDocument {
  operations: BankOperation[]
  /** Rows no template recognised, verbatim, so they are shown rather than lost. */
  unreadable: string[]
}

export type { BankId }
