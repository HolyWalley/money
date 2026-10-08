import type { BankId, BankNotificationDocument } from '../../../shared/bank-notifications'
import { parseMbankNotification } from './mbank'
import { parsePkoNotification } from './pko'
import type { BankOperation, ParsedBankDocument } from './types'

const parsers: Record<BankId, (html: string, document: BankNotificationDocument) => ParsedBankDocument> = {
  mbank: parseMbankNotification,
  pko: parsePkoNotification,
}

const bankNames: Record<BankId, string> = {
  mbank: 'mBank',
  pko: 'PKO BP',
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

/** The document's text, in the charset it was sent in or the one it declares. */
export function decodeBankDocument(content: string, charset?: string): string {
  const binary = atob(content)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  charset ??= binary.slice(0, 2048).match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] ?? 'utf-8'
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
    const result = parsers[document.bank](decodeBankDocument(document.content, document.charset), document)
    for (const operation of result.operations) {
      if (seen.has(operation.externalId)) continue
      seen.add(operation.externalId)
      parsed.operations.push(operation)
    }
    parsed.unreadable.push(...result.unreadable)
  }

  parsed.operations = mergeExchanges(parsed.operations)
  parsed.operations.sort((a, b) => a.date.localeCompare(b.date))
  return parsed
}

/**
 * The messages nothing more can come of: every operation in them is imported
 * or dismissed, and no row in them went unread. A message with an unreadable
 * row is kept, so a fixed parser can still read it before it expires.
 */
export function settledMessageIds(documents: BankNotificationDocument[], known: ReadonlySet<string>): string[] {
  const messages = new Map<string, BankNotificationDocument[]>()
  for (const document of documents) {
    messages.set(document.messageId, [...(messages.get(document.messageId) ?? []), document])
  }

  const settled: string[] = []
  for (const [messageId, parts] of messages) {
    let parsed: ParsedBankDocument
    try {
      parsed = parseBankDocuments(parts)
    } catch {
      continue
    }
    const done = parsed.operations.every(
      (operation) => known.has(operation.externalId) && operation.linkedExternalIds.every((id) => known.has(id))
    )
    if (done && parsed.unreadable.length === 0) settled.push(messageId)
  }
  return settled
}

/**
 * Folds the two sides of a currency exchange into one outgoing operation
 * that knows what the other account received. A side that arrived alone
 * stays a plain row until its partner turns up.
 */
export function mergeExchanges(operations: BankOperation[]): BankOperation[] {
  const sides = new Map<string, BankOperation[]>()
  for (const operation of operations) {
    if (!operation.exchangeId) continue
    sides.set(operation.exchangeId, [...(sides.get(operation.exchangeId) ?? []), operation])
  }

  const folded = new Set<string>()
  const merged = new Map<string, BankOperation>()
  for (const pair of sides.values()) {
    const out = pair.find((side) => side.direction === 'expense')
    const into = pair.find((side) => side.direction === 'income')
    if (pair.length !== 2 || !out || !into) continue
    folded.add(into.externalId)
    merged.set(out.externalId, {
      ...out,
      received: { account: into.account, amount: into.amount, currency: into.currency },
      linkedExternalIds: [...out.linkedExternalIds, into.externalId],
    })
  }

  return operations
    .filter((operation) => !folded.has(operation.externalId))
    .map((operation) => merged.get(operation.externalId) ?? operation)
}

export type { BankOperation, ParsedBankDocument } from './types'
