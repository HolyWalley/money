import { describe, it, expect } from 'vitest'
import type { BankNotificationDocument } from '../../../shared/bank-notifications'
import { decodeBankDocument, formatBankAccount, parseBankDocuments } from './index'

function toBase64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes))
}

function ascii(value: string): number[] {
  return [...value].map((character) => character.charCodeAt(0))
}

function mbankDocument(messageId: string, rows: string): BankNotificationDocument {
  const html = `<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8" /></head><body>
    <h1>2026-10-04 - Powiadomienie</h1>
    <table><tr><th>Czas operacji</th><th>Opis operacji</th></tr>${rows}</table></body></html>`
  return {
    bank: 'mbank',
    messageId,
    receivedAt: '2026-10-05T05:50:51Z',
    filename: 'Powiadomienie e-mail z 2026-10-04.htm',
    content: btoa(html),
  }
}

function row(time: string, balance: string): string {
  return `<tr><td>${time}</td><td>mBank: Przelew wych. z rach. 12345678 na rach. 59...66 kwota 116,00 PLN dla ANNA NOWAK; CZYNSZ; Dost. ${balance} PLN</td></tr>`
}

describe('decodeBankDocument', () => {
  it('reads the charset the document declares', () => {
    // "ŚRODKÓW" in ISO-8859-2: Ś is 0xA6 and Ó is 0xD3.
    const bytes = [...ascii('<meta content="text/html; charset=iso-8859-2" />'), 0xa6, ...ascii('RODK'), 0xd3, ...ascii('W')]

    expect(decodeBankDocument(toBase64(bytes))).toContain('ŚRODKÓW')
  })

  it('falls back to UTF-8', () => {
    expect(decodeBankDocument(btoa('<p>plain</p>'))).toBe('<p>plain</p>')
  })
})

describe('parseBankDocuments', () => {
  it('merges documents in date order and drops a repeated row', () => {
    const parsed = parseBankDocuments([
      mbankDocument('2', row('13:25', '98,10')),
      mbankDocument('1', row('13:13', '214,10') + row('13:25', '98,10')),
    ])

    expect(parsed.operations.map((operation) => operation.balanceAfter)).toEqual([214.1, 98.1])
  })
})

describe('formatBankAccount', () => {
  it('names the bank and the end of the account number', () => {
    expect(formatBankAccount('mbank:12345678')).toBe('mBank …5678')
  })
})
