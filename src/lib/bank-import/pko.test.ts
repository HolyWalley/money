import { describe, it, expect } from 'vitest'
import { parsePkoNotification } from './pko'

const RECEIVED = { receivedAt: '2026-10-08T04:33:09Z' }

function email(heading: string, intro: string, line: string, balance: string): string {
  return `<html><head><meta charset="utf-8"></head><body><table><tr><td>
    <span><strong>${heading}</strong></span></td></tr><tr><td><span>
      Dzień dobry,<br>
 <br>
 ${intro}<br>
 <br>
 ${line}<br>
 <br>
 <br>
 Stan            konta po operacji: ${balance}<br>
 <br>
 Więcej informacji o tej transakcji znajdziesz w aplikacji mobilnej.<br>
 Z pozdrowieniami<br>
 PKO Bank Polski</span></td></tr></table></body></html>`
}

const DEBIT = email(
  'Obciążenie konta',
  'Twoje konto 73..7365 zostało obciążone kwotą             <strong>-1300,00 PLN</strong>,            w tym:',
  '-1300,00 PLN Przelew z konta, odbiorca: POKOJ&nbsp;, tytuł: ANNA NOWAK / CZYNSZ / PAZDZIERNIK 2026',
  '+19,13 PLN'
)

const EXCHANGE_OUT = email(
  'Obciążenie konta',
  'Twoje konto 31..0034 zostało obciążone kwotą <strong>-298,34 EUR</strong>, w tym:',
  '-298,34 EUR Wymiana w kantorze - obciążenie, odbiorca: JAN KOWALSKI&nbsp;, tytuł: FX101039173 EUR/PLN 4.3575&nbsp;&nbsp;1&nbsp;300,00 PLN -298,34 EUR',
  '+4819,21 EUR'
)

const EXCHANGE_IN = email(
  'Uznanie konta',
  'na Twoje konto 73..7365 wpłynęła kwota <strong>+1300,00 PLN</strong>, w tym:',
  '+1300,00 PLN Wymiana w kantorze - uznanie, nadawca: JAN KOWALSKI, tytuł: FX101039173 EUR/PLN 4.3575&nbsp;&nbsp;1&nbsp;300,00 PLN -298,34 EUR',
  '+1319,13 PLN'
)

describe('parsePkoNotification', () => {
  it('reads an outgoing transfer, dated by the email', () => {
    const { operations, unreadable } = parsePkoNotification(DEBIT, RECEIVED)

    expect(unreadable).toEqual([])
    expect(operations).toEqual([
      {
        externalId: expect.stringMatching(/^pko:[0-9a-f]{16}$/),
        bank: 'pko',
        account: 'pko:73..7365',
        date: '2026-10-08T04:33:09Z',
        direction: 'expense',
        amount: 1300,
        currency: 'PLN',
        counterparty: 'POKOJ',
        title: 'ANNA NOWAK / CZYNSZ / PAZDZIERNIK 2026',
        description: '-1300,00 PLN Przelew z konta, odbiorca: POKOJ , tytuł: ANNA NOWAK / CZYNSZ / PAZDZIERNIK 2026',
        balanceAfter: 19.13,
        suggestTransfer: false,
        linkedExternalIds: [],
      },
    ])
  })

  it('reads the outgoing side of an exchange as a transfer with its exchange id', () => {
    const [operation] = parsePkoNotification(EXCHANGE_OUT, RECEIVED).operations

    expect(operation).toMatchObject({
      account: 'pko:31..0034',
      direction: 'expense',
      amount: 298.34,
      currency: 'EUR',
      balanceAfter: 4819.21,
      suggestTransfer: true,
      exchangeId: 'pko:FX101039173',
    })
  })

  it('reads the incoming side of an exchange', () => {
    const [operation] = parsePkoNotification(EXCHANGE_IN, RECEIVED).operations

    expect(operation).toMatchObject({
      account: 'pko:73..7365',
      direction: 'income',
      amount: 1300,
      currency: 'PLN',
      exchangeId: 'pko:FX101039173',
    })
  })

  it('gives the same email the same id on every read', () => {
    expect(parsePkoNotification(DEBIT, RECEIVED).operations[0].externalId).toBe(
      parsePkoNotification(DEBIT, RECEIVED).operations[0].externalId
    )
  })

  it('reads nothing from an email that is not an operation', () => {
    expect(parsePkoNotification('<p>Zmiana salda na ujemne</p>', RECEIVED)).toEqual({ operations: [], unreadable: [] })
  })
})
