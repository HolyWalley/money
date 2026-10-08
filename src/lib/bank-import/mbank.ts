import { hashParts } from '../import/types'
import type { BankOperation, ParsedBankDocument } from './types'

const TIME_ZONE = 'Europe/Warsaw'

const AMOUNT = String.raw`(-?\d[\d\s]*,\d{2})\s([A-Z]{3})`

const OUTGOING_TRANSFER = new RegExp(
  String.raw`^mBank: Przelew wych\. z rach\. (\d+) na rach\. \S+ kwota ${AMOUNT} dla (.*?); (.*); Dost\. ${AMOUNT}$`
)

const CARD_AUTHORISATION = new RegExp(
  String.raw`^mBank: Autoryzacja karty \d{4}\*{3}(\d{4}): (.*)\. Kwota: ${AMOUNT}\. Dostepne: ${AMOUNT}\.$`
)

/** Rows that move no money: sign-ins and declined card payments. */
const NOT_OPERATIONS = [/^mBank: Potwierdzenie poprawnego logowania/, /^mBank: Odmowa autoryzacji/]

/** Card payments that are really top-ups of the person's other accounts. */
const OWN_ACCOUNT_MERCHANTS = /^REVOLUT\b/i

type Reading = Omit<BankOperation, 'externalId' | 'bank' | 'date' | 'description' | 'linkedExternalIds'>

function parseAmount(value: string): number {
  return Number(value.replace(/\s/g, '').replace(',', '.'))
}

/** The instant a wall-clock time in `timeZone` names, as ISO 8601. */
function zonedToIso(dateKey: string, time: string, timeZone: string): string {
  const guess = new Date(`${dateKey}T${time}:00.000Z`)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(guess)
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value)
  const shown = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'))
  return new Date(guess.getTime() - (shown - guess.getTime())).toISOString()
}

function text(node: Element | null | undefined): string {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function readRow(description: string): Reading | null {
  const transfer = description.match(OUTGOING_TRANSFER)
  if (transfer) {
    const [, account, amount, currency, counterparty, title, balance] = transfer
    return {
      account: `mbank:${account}`,
      direction: 'expense',
      amount: parseAmount(amount),
      currency,
      counterparty: counterparty.trim(),
      title: title.trim(),
      balanceAfter: parseAmount(balance),
      suggestTransfer: false,
    }
  }

  const card = description.match(CARD_AUTHORISATION)
  if (card) {
    const [, cardEnding, merchant, amount, currency, balance] = card
    return {
      account: `mbank:card-${cardEnding}`,
      direction: 'expense',
      amount: parseAmount(amount),
      currency,
      counterparty: merchant.trim(),
      title: '',
      balanceAfter: parseAmount(balance),
      suggestTransfer: OWN_ACCOUNT_MERCHANTS.test(merchant),
    }
  }

  return null
}

/**
 * Reads mBank's daily "Powiadomienie e-mail" attachment: one table row per
 * event, a time and a one-line description in the bank's SMS wording.
 */
export function parseMbankNotification(html: string): ParsedBankDocument {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const dateKey = text(document.querySelector('h1')).match(/\d{4}-\d{2}-\d{2}/)?.[0]

  const table = [...document.querySelectorAll('table')].find((candidate) =>
    [...candidate.querySelectorAll(':scope > tbody > tr > th, :scope > tr > th')].some((header) =>
      text(header).startsWith('Czas operacji')
    )
  )

  const operations: BankOperation[] = []
  const unreadable: string[] = []
  const seen = new Map<string, number>()

  for (const row of table?.querySelectorAll('tr') ?? []) {
    const cells = row.querySelectorAll('td')
    if (cells.length < 2) continue

    const time = text(cells[0])
    const description = text(cells[1])
    if (NOT_OPERATIONS.some((pattern) => pattern.test(description))) continue

    const reading = readRow(description)
    if (!dateKey || !/^\d{2}:\d{2}$/.test(time) || !reading) {
      unreadable.push(`${time} ${description}`.trim())
      continue
    }

    const identity = hashParts([dateKey, time, description])
    const occurrence = (seen.get(identity) ?? 0) + 1
    seen.set(identity, occurrence)

    operations.push({
      externalId: `mbank:${hashParts([dateKey, time, description, occurrence])}`,
      bank: 'mbank',
      date: zonedToIso(dateKey, time, TIME_ZONE),
      description,
      linkedExternalIds: [],
      ...reading,
    })
  }

  return { operations, unreadable }
}
