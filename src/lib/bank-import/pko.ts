import type { BankNotificationDocument } from '../../../shared/bank-notifications'
import { hashParts } from '../import/types'
import type { BankOperation, ParsedBankDocument } from './types'

const AMOUNT = String.raw`([+-]?\d[\d ]*,\d{2}) ([A-Z]{3})`

const DEBIT_HEADER = /Twoje konto (\S+) zostało obciążone kwotą/
const CREDIT_HEADER = /na Twoje konto (\S+) wpłynęła kwota/
const OPERATION_LINE = new RegExp(String.raw`^${AMOUNT} (.+?), (?:odbiorca|nadawca): (.*?) ?, tytuł: (.*)$`, 'm')
const BALANCE = new RegExp(String.raw`Stan konta po operacji: ${AMOUNT}`)

const EXCHANGE = /^Wymiana w kantorze/
const EXCHANGE_ID = /^(FX\d+)/

function parseAmount(value: string): number {
  return Math.abs(Number(value.replace(/[\s+]/g, '').replace(',', '.')))
}

/** The email as lines of text: breaks kept, every other run of whitespace collapsed. */
function textLines(html: string): string {
  const document = new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, '\n'), 'text/html')
  return (document.body.textContent ?? '')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

/**
 * Reads one of PKO BP's per-operation emails ("Obciążenie konta", "Uznanie
 * konta"). The email names no time of its own, so the operation is dated by
 * when the email arrived.
 */
export function parsePkoNotification(html: string, document: Pick<BankNotificationDocument, 'receivedAt'>): ParsedBankDocument {
  const text = textLines(html)

  const debit = text.match(DEBIT_HEADER)
  const credit = text.match(CREDIT_HEADER)
  const line = text.match(OPERATION_LINE)
  const header = debit ?? credit

  if (!header || !line) {
    return { operations: [], unreadable: line ? [line[0]] : [] }
  }

  const [description, amount, currency, kind, counterparty, title] = line
  const balance = text.match(BALANCE)

  const operation: BankOperation = {
    externalId: `pko:${hashParts([document.receivedAt, header[1], description])}`,
    bank: 'pko',
    account: `pko:${header[1]}`,
    date: document.receivedAt,
    direction: debit ? 'expense' : 'income',
    amount: parseAmount(amount),
    currency,
    counterparty: counterparty.trim(),
    title: title.trim(),
    description,
    balanceAfter: balance ? Number(balance[1].replace(/[\s+]/g, '').replace(',', '.')) : undefined,
    suggestTransfer: EXCHANGE.test(kind),
    linkedExternalIds: [],
  }

  const exchangeId = EXCHANGE.test(kind) ? title.match(EXCHANGE_ID)?.[1] : undefined
  if (exchangeId) operation.exchangeId = `pko:${exchangeId}`

  return { operations: [operation], unreadable: [] }
}
