import type { BankId, BankNotificationDocument } from '../../../shared/bank-notifications'
import { parseMbankNotification } from './mbank'
import type { ParsedBankDocument } from './types'

const parsers: Record<BankId, (html: string) => ParsedBankDocument> = {
  mbank: parseMbankNotification,
}

const bankNames: Record<BankId, string> = {
  mbank: 'mBank',
}

export function bankName(bank: BankId): string {
  return bankNames[bank]
}

/** 'mbank:84235780' as a person would read it. */
export function formatBankAccount(account: string): string {
  const [bank, number = ''] = account.split(':')
  const name = bankNames[bank as BankId] ?? bank
  return number ? `${name} …${number.slice(-4)}` : name
}

/** The attachment's text, read in the charset the document itself declares. */
export function decodeBankDocument(content: string): string {
  const binary = atob(content)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  const charset = binary.slice(0, 2048).match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] ?? 'utf-8'
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

export function parseBankDocuments(documents: BankNotificationDocument[]): ParsedBankDocument {
  const parsed: ParsedBankDocument = { operations: [], unreadable: [] }
  const seen = new Set<string>()

  for (const document of documents) {
    const result = parsers[document.bank](decodeBankDocument(document.content))
    for (const operation of result.operations) {
      if (seen.has(operation.externalId)) continue
      seen.add(operation.externalId)
      parsed.operations.push(operation)
    }
    parsed.unreadable.push(...result.unreadable)
  }

  parsed.operations.sort((a, b) => a.date.localeCompare(b.date))
  return parsed
}

export type { BankOperation, ParsedBankDocument } from './types'
