import { hashParts } from '../import/types'
import type { BankOperation, ParsedBankDocument } from './types'

const TIME_ZONE = 'Europe/Warsaw'

const AMOUNT = String.raw`(-?\d[\d\s]*,\d{2})\s([A-Z]{3})`

const OUTGOING_TRANSFER = new RegExp(
  String.raw`^mBank: Przelew wych\. z rach\. (\d+) na rach\. \S+ kwota ${AMOUNT} dla (.*?); (.*); Dost\. ${AMOUNT}$`
)

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

/**
 * Reads mBank's daily "Powiadomienie e-mail" attachment: one table row per
 * operation, a time and a one-line description.
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
    const match = description.match(OUTGOING_TRANSFER)

    if (!dateKey || !/^\d{2}:\d{2}$/.test(time) || !match) {
      unreadable.push(`${time} ${description}`.trim())
      continue
    }

    const [, account, amount, currency, counterparty, title, balance] = match
    const identity = hashParts([dateKey, time, description])
    const occurrence = (seen.get(identity) ?? 0) + 1
    seen.set(identity, occurrence)

    operations.push({
      externalId: `mbank:${hashParts([dateKey, time, description, occurrence])}`,
      bank: 'mbank',
      account: `mbank:${account}`,
      date: zonedToIso(dateKey, time, TIME_ZONE),
      direction: 'expense',
      amount: parseAmount(amount),
      currency,
      counterparty: counterparty.trim(),
      title: title.trim(),
      description,
      balanceAfter: parseAmount(balance),
    })
  }

  return { operations, unreadable }
}
