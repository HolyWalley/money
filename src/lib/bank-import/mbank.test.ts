import { describe, it, expect } from 'vitest'
import { parseMbankNotification } from './mbank'

function notification(rows: Array<[string, string]>, date = '2026-10-04'): string {
  const body = rows
    .map(([time, description]) => `<tr><td class="td"><nobr>${time}</nobr></td><td class="td">${description}</td></tr>`)
    .join('')
  return `<html><body><div>
    <table role="presentation"><tr><td><h1 class="h1">${date} -
Powiadomienie <span lang="en">e-mail</span></h1></td></tr>
    <tr><td><table border="1"><tr><th class="th">Dane banku</th><th class="th">Dane klienta</th></tr>
      <tr><td class="td">mBank S.A.</td><td class="td">JAN KOWALSKI</td></tr></table></td></tr>
    <tr><td><table border="1">
      <tr><th class="th"><nobr>Czas operacji</nobr><br />(GG:MM)</th><th class="th">Opis operacji</th></tr>
      ${body}
    </table></td></tr></table>
  </div></body></html>`
}

const TRANSFER = 'mBank: Przelew wych. z rach. 12345678 na rach. 5910...425866 kwota 116,00 PLN dla ANNA NOWAK; PRZELEW ŚRODKÓW; Dost. 214,10 PLN'
const SECOND = 'mBank: Przelew wych. z rach. 12345678 na rach. 5910...425866 kwota 116,00 PLN dla ANNA NOWAK; PRZELEW ŚRODKÓW; Dost. 98,10 PLN'

describe('parseMbankNotification', () => {
  it('reads an outgoing transfer', () => {
    const { operations, unreadable } = parseMbankNotification(notification([['13:13', TRANSFER]]))

    expect(unreadable).toEqual([])
    expect(operations).toEqual([
      {
        externalId: expect.stringMatching(/^mbank:[0-9a-f]{16}$/),
        bank: 'mbank',
        account: 'mbank:12345678',
        date: '2026-10-04T11:13:00.000Z',
        direction: 'expense',
        amount: 116,
        currency: 'PLN',
        counterparty: 'ANNA NOWAK',
        title: 'PRZELEW ŚRODKÓW',
        description: TRANSFER,
        balanceAfter: 214.1,
        suggestTransfer: false,
        linkedExternalIds: [],
      },
    ])
  })

  it('reads the time on the Warsaw clock in winter too', () => {
    const { operations } = parseMbankNotification(notification([['13:13', TRANSFER]], '2026-12-04'))

    expect(operations[0].date).toBe('2026-12-04T12:13:00.000Z')
  })

  it('keeps two identical transfers apart', () => {
    const { operations } = parseMbankNotification(notification([['13:13', TRANSFER], ['13:25', SECOND]]))

    expect(operations).toHaveLength(2)
    expect(operations[0].externalId).not.toBe(operations[1].externalId)
  })

  it('keeps two rows apart even when they are the same to the letter', () => {
    const { operations } = parseMbankNotification(notification([['13:13', TRANSFER], ['13:13', TRANSFER]]))

    expect(new Set(operations.map((operation) => operation.externalId)).size).toBe(2)
  })

  it('gives the same row the same id on every read', () => {
    const first = parseMbankNotification(notification([['13:13', TRANSFER]]))
    const second = parseMbankNotification(notification([['13:13', TRANSFER], ['13:25', SECOND]]))

    expect(second.operations[0].externalId).toBe(first.operations[0].externalId)
  })

  it('reads amounts with thousands separators', () => {
    const row = TRANSFER.replace('116,00', '1 116,50').replace('214,10', '12 214,10')

    const { operations } = parseMbankNotification(notification([['13:13', row]]))

    expect(operations[0].amount).toBe(1116.5)
    expect(operations[0].balanceAfter).toBe(12214.1)
  })

  it('reads a card payment, keyed by the card', () => {
    const row = 'mBank: Autoryzacja karty 5575***9678: LIDL SIERAKOWSKIEGO WARSZAWA. Kwota: 36,53 PLN. Dostepne: 61,57 PLN.'

    const { operations, unreadable } = parseMbankNotification(notification([['18:02', row]]))

    expect(unreadable).toEqual([])
    expect(operations[0]).toMatchObject({
      account: 'mbank:card-9678',
      direction: 'expense',
      amount: 36.53,
      currency: 'PLN',
      counterparty: 'LIDL SIERAKOWSKIEGO WARSZAWA',
      title: '',
      balanceAfter: 61.57,
      suggestTransfer: false,
    })
  })

  it('reads a card payment in another currency', () => {
    const row = 'mBank: Autoryzacja karty 5575***9678: REVOLUT**5738* VILNIUS. Kwota: 382,81 EUR. Dostepne: 0,00 EUR.'

    const { operations } = parseMbankNotification(notification([['12:00', row]]))

    expect(operations[0]).toMatchObject({ amount: 382.81, currency: 'EUR', balanceAfter: 0 })
  })

  it('suggests a transfer for a Revolut top-up', () => {
    const row = 'mBank: Autoryzacja karty 5575***9678: REVOLUT**5738* VILNIUS. Kwota: 1346,84 PLN. Dostepne: 98,10 PLN.'

    const { operations } = parseMbankNotification(notification([['12:00', row]]))

    expect(operations[0].suggestTransfer).toBe(true)
  })

  it('drops sign-ins and declined payments without listing them as unreadable', () => {
    const { operations, unreadable } = parseMbankNotification(
      notification([
        ['08:02', 'mBank: Potwierdzenie poprawnego logowania do kanalu Internet. Data i godzina zdarzenia: 05-10-2026 08:02.'],
        ['12:00', 'mBank: Odmowa autoryzacji 5575***9678: BRAK ŚRODKÓW. REVOLUT**5738* VILNIUS. Naleznosc: 1346,84 PLN. Dostepne: 98,10 PLN.'],
      ])
    )

    expect(operations).toEqual([])
    expect(unreadable).toEqual([])
  })

  it('returns a row it does not recognise verbatim', () => {
    const { operations, unreadable } = parseMbankNotification(
      notification([['09:00', 'mBank: Przelew przych. z rach. 11 kwota 20,00 PLN']])
    )

    expect(operations).toEqual([])
    expect(unreadable).toEqual(['09:00 mBank: Przelew przych. z rach. 11 kwota 20,00 PLN'])
  })

  it('reads nothing from a document that is not a notification', () => {
    expect(parseMbankNotification('<html><body><p>Hello</p></body></html>')).toEqual({ operations: [], unreadable: [] })
  })
})
