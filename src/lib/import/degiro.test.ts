import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { UTCDate } from '@date-fns/utc'
import { degiroParser, detectDegiro, parseDegiro, DEGIRO_CASH_ACCOUNT_ISIN } from './degiro'
import type { ParsedRow, ParsedRowKind } from './types'
import {
  DEGIRO_FIXTURE,
  REVOLUT_FIXTURE,
  expectedDegiroCashBalance,
  expectedDegiroCurrencies,
  expectedDegiroDepositTotal,
  expectedDegiroDividendTotal,
  expectedDegiroFeeTotal,
  expectedDegiroInstrumentCount,
  expectedDegiroInterestTotal,
  expectedDegiroLargestBuyQuantity,
  expectedDegiroNonInstrumentIsin,
  expectedDegiroPartialFillOrderId,
  expectedDegiroPartialFillQuantities,
  expectedDegiroPartialFillRowCount,
  expectedDegiroPositions,
  expectedDegiroRowCounts,
  expectedDegiroRowTotal,
  expectedDegiroStatedBalances,
  expectedDegiroUnknownDescriptions,
} from './__fixtures__/expected'

const FIXTURES = join(__dirname, '__fixtures__')

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8')
}

const HEADER = 'Date,Time,Value date,Product,ISIN,Description,FX,Change,,Balance,,Order Id'

/** A one-row statement, so a single trap can be examined without the fixture around it. */
function statement(...lines: string[]): ParsedRow[] {
  return parseDegiro([HEADER, ...lines, ''].join('\n')).rows
}

/** A trade line for one ETF, so only the numbers under test differ between rows. */
function trade(verb: string, quantity: string, price: string, cash: string): string {
  const description = `${verb} ${quantity} Invesco FTSE All World UCITS ETF Acc@${price} EUR (IE000716YHJ7)`
  return `21-07-2025,15:43,21-07-2025,INVESCO FTSE ALL WORLD UCITS ETF ACC,IE000716YHJ7,"${description}",,EUR,"${cash}",EUR,"8,09",`
}

const degiro = parseDegiro(fixture(DEGIRO_FIXTURE))

function countByKind(rows: ParsedRow[]): Partial<Record<ParsedRowKind, number>> {
  const counts: Partial<Record<ParsedRowKind, number>> = {}
  for (const row of rows) counts[row.kind] = (counts[row.kind] ?? 0) + 1
  return counts
}

function totalFor(rows: ParsedRow[], kind: ParsedRowKind): number {
  return rows.filter((row) => row.kind === kind).reduce((sum, row) => sum + row.amount, 0)
}

describe('detectDegiro', () => {
  it('recognises the DeGiro account statement header', () => {
    expect(detectDegiro(fixture(DEGIRO_FIXTURE))).toBe(true)
  })

  it('recognises the header through a BOM and CRLF line endings', () => {
    expect(detectDegiro(`\ufeff${HEADER}\r\n21-06-2023,16:45,21-06-2023,,,Depozyt,,EUR,"1,00",EUR,"1,00",\r\n`)).toBe(true)
  })

  it('rejects another broker and non-CSV text', () => {
    expect(detectDegiro(fixture(REVOLUT_FIXTURE))).toBe(false)
    expect(detectDegiro('hello')).toBe(false)
    expect(detectDegiro('')).toBe(false)
  })

  it('rejects a header that names the two columns DeGiro leaves blank', () => {
    const named = HEADER.replace('Change,,Balance,,', 'Change,Change Amount,Balance,Balance Amount,')

    expect(detectDegiro(named)).toBe(false)
  })

  it('is exposed on the parser as its broker id', () => {
    expect(degiroParser.broker).toBe('degiro')
    expect(degiroParser.detect(fixture(DEGIRO_FIXTURE))).toBe(true)
    expect(degiroParser.parse(fixture(DEGIRO_FIXTURE)).rows).toHaveLength(expectedDegiroRowTotal)
  })
})

describe('parseDegiro', () => {
  it('returns every source row exactly once and no header row', () => {
    expect(degiro.broker).toBe('degiro')
    expect(degiro.rows).toHaveLength(expectedDegiroRowTotal)
    expect(degiro.warnings).toEqual([])
    expect(degiro.rows.some((row) => row.raw.startsWith('Date,Time'))).toBe(false)
  })

  it('classifies every row as the statement expects', () => {
    const counts = countByKind(degiro.rows)

    for (const [kind, expected] of Object.entries(expectedDegiroRowCounts)) {
      expect({ kind, count: counts[kind as ParsedRowKind] ?? 0 }).toEqual({ kind, count: expected })
    }
  })

  it('lists the currencies in order of first appearance', () => {
    expect(degiro.currencies).toEqual(expectedDegiroCurrencies)
  })

  it('keeps the original line on every row for the import preview', () => {
    for (const row of degiro.rows) {
      expect(row.raw).not.toBe('')
      expect(row.raw).not.toContain('\n')
    }
  })
})

describe('number and date formats', () => {
  it('reads a decimal comma', () => {
    const [row] = statement('21-07-2025,15:43,21-07-2025,,,DEGIRO Exchange Connection Fee 2025 (Xetra - XET),,EUR,"-2,50",EUR,"8,09",')

    expect(row.amount).toBe(-2.5)
  })

  it('reads a space-grouped thousand, whether the space is plain or non-breaking', () => {
    const plainSpace = '21-07-2025,15:43,21-07-2025,,,Depozyt,,EUR,"1 697,99",EUR,"1 697,99",'
    const nonBreakingSpace = plainSpace.replace(/ /g, '\u00a0')

    const [plain] = statement(plainSpace)
    const [nonBreaking] = statement(nonBreakingSpace)

    expect(plain.amount).toBe(1697.99)
    expect(nonBreaking.amount).toBe(1697.99)
  })

  it('reads an English-locale export, where the separators are the other way round', () => {
    const [row] = statement('21-07-2025,15:43,21-07-2025,,,Depozyt,,EUR,"1,697.99",EUR,"1,697.99",')

    expect(row.amount).toBe(1697.99)
  })

  it('turns DD-MM-YYYY and the Time column into one instant', () => {
    expect(degiro.rows[0].date).toBe('2025-07-21T16:31:00.000Z')
    expect(degiro.rows[degiro.rows.length - 1].date).toBe('2023-06-17T00:12:00.000Z')
    expect(degiro.rows.every((row) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(row.date))).toBe(true)
  })

  it('keeps the calendar date DeGiro printed, instead of shifting a late row into the next day', () => {
    // The Time column is CET/CEST wall clock, so reading 23:30 as Warsaw time
    // and converting it would post this row on the 22nd.
    const [row] = statement('21-07-2025,23:30,21-07-2025,,,Depozyt,,EUR,"1,00",EUR,"1,00",')

    expect(row.date).toBe('2025-07-21T23:30:00.000Z')
    expect(new UTCDate(row.date).getDate()).toBe(21)

    for (const source of degiro.rows) {
      const [day, month, year] = source.raw.split(',')[0].split('-')
      expect(source.date.slice(0, 10)).toBe(`${year}-${month}-${day}`)
    }
  })

  it('separates two rows of one day, which a date alone leaves tied', () => {
    const morning = '18-01-2024,09:04,18-01-2024,,,Depozyt,,EUR,"1,00",EUR,"1,00",'
    const evening = '18-01-2024,17:31,18-01-2024,,,Depozyt,,EUR,"2,00",EUR,"3,00",'

    // Newest first, the way DeGiro exports; storage sorts on this field, so a
    // tie there would leave a sell ahead of the buy it closes.
    const rows = statement(evening, morning)
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))

    expect(rows[0].date).not.toBe(rows[1].date)
    expect(sorted.map((row) => row.amount)).toEqual([1, 2])
  })

  it('warns rather than guesses when a date is in an unknown shape', () => {
    const [row] = statement('2025/07/21,15:43,21-07-2025,,,Depozyt,,EUR,"1,00",EUR,"1,00",')

    expect(row.warnings).toContain('Unrecognised date "2025/07/21"')
  })

  it('falls back to midnight, with a warning, when the time is in an unknown shape', () => {
    const [row] = statement('21-07-2025,quarter past,21-07-2025,,,Depozyt,,EUR,"1,00",EUR,"1,00",')

    expect(row.date).toBe('2025-07-21T00:00:00.000Z')
    expect(row.warnings).toContain('Unrecognised time "quarter past"')
  })

  it('refuses a time whose digits are out of range, instead of minting an instant nothing can read', () => {
    // Both read as HH:MM by shape alone, and both are appended to the date
    // verbatim: '24:00' rolls the row onto the 22nd, '25:70' parses to nothing.
    const [rolled] = statement('21-07-2025,24:00,21-07-2025,,,Depozyt,,EUR,"1,00",EUR,"1,00",')
    const [impossible] = statement('21-07-2025,25:70,21-07-2025,,,Depozyt,,EUR,"1,00",EUR,"1,00",')

    expect(new UTCDate(rolled.date).getDate()).toBe(21)
    expect(rolled.warnings).toContain('Unrecognised time "24:00"')
    expect(Number.isNaN(Date.parse(impossible.date))).toBe(false)
    expect(impossible.warnings).toContain('Unrecognised time "25:70"')
  })
})

describe('trade rows', () => {
  const buys = degiro.rows.filter((row) => row.kind === 'buy')

  it('reads a space-grouped quantity as the thousands it is, non-breaking space and all', () => {
    const row = buys.find((buy) => buy.raw.includes('9ca81245-9208-4b25-844e-6dfb0766d5c3'))

    expect(row?.quantity).toBe(expectedDegiroLargestBuyQuantity)
    expect(row?.price).toBe(6.45)
    expect(row?.amount).toBeCloseTo(-9933, 2)
    expect(row?.warnings).toEqual([])

    // The same trap with a plain space, on a cash leg DeGiro had to round:
    // 1631 x 6,263 is 10214,9503, so the derived quantity is 1630.999521.
    const [plain] = statement(trade('Kupno', '1 631', '6,263', '-10214,95'))

    expect(plain.quantity).toBe(1631)
    expect(plain.warnings).toEqual([])
  })

  it('reconciles quantity x price back to the cash amount on every buy', () => {
    for (const buy of buys) {
      expect(buy.quantity! * buy.price!).toBeCloseTo(Math.abs(buy.amount), 2)
    }
  })

  it('accumulates to the positions the statement ends with', () => {
    for (const position of expectedDegiroPositions) {
      const rows = buys.filter((buy) => buy.isin === position.isin)
      const quantity = rows.reduce((sum, row) => sum + row.quantity!, 0)
      const cost = rows.reduce((sum, row) => sum + Math.abs(row.amount), 0)

      expect(quantity).toBeCloseTo(position.quantity, 8)
      expect(cost).toBeCloseTo(position.cost, 2)
      expect(rows[0].instrumentName).toBe(position.name)
      expect(rows[0].currency).toBe(position.currency)
    }
  })

  it('takes direction from the sign of the cash, so a positive @-price row is a sell', () => {
    const [row] = statement('21-07-2025,15:43,21-07-2025,INVESCO FTSE ALL WORLD UCITS ETF ACC,IE000716YHJ7,"Kupno 100 Invesco FTSE All World UCITS ETF Acc@8,55 EUR (IE000716YHJ7)",,EUR,"855,00",EUR,"8,09",')

    expect(row.kind).toBe('sell')
    expect(row.quantity).toBe(100)
  })

  it('reads a Polish sell verb as a sell and stays quiet when the cash agrees', () => {
    const [row] = statement('21-07-2025,15:43,21-07-2025,INVESCO FTSE ALL WORLD UCITS ETF ACC,IE000716YHJ7,"Sprzedaż 100 Invesco FTSE All World UCITS ETF Acc@8,55 EUR (IE000716YHJ7)",,EUR,"855,00",EUR,"8,09",')

    expect(row.kind).toBe('sell')
    expect(row.warnings).toEqual([])
  })

  it('trusts the cash over the verb, and says so, when the two disagree', () => {
    const [row] = statement('21-07-2025,15:43,21-07-2025,INVESCO FTSE ALL WORLD UCITS ETF ACC,IE000716YHJ7,"Sprzedaż 100 Invesco FTSE All World UCITS ETF Acc@8,55 EUR (IE000716YHJ7)",,EUR,"-855,00",EUR,"8,09",')

    expect(row.kind).toBe('buy')
    expect(row.warnings).toEqual([
      'Description reads as a sell but the cash moved the other way, so it was treated as a buy',
    ])
  })

  it('takes the exact quantity from the description where the rounded cash leg only approximates it', () => {
    // 73 x 6,263 is 457,199, which DeGiro posts as 457,20; dividing that back
    // gives 73.00015967 rather than 73.
    const [row] = statement(trade('Kupno', '73', '6,263', '-457,20'))

    expect(row.quantity).toBe(73)
    expect(row.warnings).toEqual([])
  })

  it('accumulates those exact quantities into a position that closes at zero', () => {
    const rows = statement(
      trade('Kupno', '73', '6,263', '-457,20'),
      trade('Kupno', '2', '6,263', '-12,53'),
      trade('Kupno', '2705', '6,263', '-16941,42'),
      trade('Sprzedaż', '2780', '6,263', '17411,14')
    )
    const held = rows.reduce((sum, row) => sum + (row.kind === 'sell' ? -row.quantity! : row.quantity!), 0)

    expect(rows.map((row) => row.quantity)).toEqual([73, 2, 2705, 2780])
    // Three cash legs rounded the same way leave 2780.00159667 held, and a
    // position that never reads as closed.
    expect(held).toBe(0)
  })

  it('warns, rather than fails, when the stated quantity is genuinely out', () => {
    const [row] = statement('21-07-2025,15:43,21-07-2025,INVESCO FTSE ALL WORLD UCITS ETF ACC,IE000716YHJ7,"Kupno 12 Invesco FTSE All World UCITS ETF Acc@10 EUR (IE000716YHJ7)",,EUR,"-100,00",EUR,"8,09",')

    expect(row.kind).toBe('buy')
    expect(row.quantity).toBe(10)
    expect(row.warnings).toEqual(['Description says 12 but the cash amount implies 10'])
  })

  it('does not swallow a product name that begins with a number', () => {
    // A space groups thousands only in groups of three, and even then only if
    // the cash agrees: '21Shares' and '3D Systems' are real product names, and
    // reading their leading digits as part of the quantity raised a false
    // disagreement warning on every such row.
    const description = 'Kupno 10 21 Shares Bitcoin ETP@10,00 EUR (IE000716YHJ7)'
    const [row] = statement(
      `21-07-2025,15:43,21-07-2025,21 SHARES BITCOIN ETP,IE000716YHJ7,"${description}",,EUR,"-100,00",EUR,"8,09",`
    )

    expect(row.quantity).toBe(10)
    expect(row.warnings).toEqual([])
  })

  it('reads past a three-digit group that belongs to the product name', () => {
    // Structurally identical to '1 630 Invesco': only the cash can tell '10 123
    // Shares of X' (ten) from a grouped ten thousand, so both readings are
    // offered and the one the cash confirms is taken without complaint.
    const description = 'Kupno 10 123 Shares Bitcoin ETP@10,00 EUR (IE000716YHJ7)'
    const [row] = statement(
      `21-07-2025,15:43,21-07-2025,123 SHARES BITCOIN ETP,IE000716YHJ7,"${description}",,EUR,"-100,00",EUR,"8,09",`
    )

    expect(row.quantity).toBe(10)
    expect(row.warnings).toEqual([])
  })

  it('reads an English-locale export, where the thousands group is a comma', () => {
    const description = 'Buy 1,540 Invesco FTSE All World UCITS ETF Acc@6.45 EUR (IE000716YHJ7)'
    const [row] = statement(`06-07-2023,16:57,06-07-2023,INVESCO FTSE ALL WORLD UCITS ETF ACC,IE000716YHJ7,"${description}",,EUR,"-9,933.00",EUR,"9.10",`)

    expect(row.kind).toBe('buy')
    expect(row.quantity).toBe(1540)
    expect(row.warnings).toEqual([])
  })

  it('reads the same digits as a fraction when the cash says that is what they are', () => {
    // '1,540' is 1540 shares in an English export and 1,54 of one in a Polish
    // export. Only the cash column can say which, so it decides - and 1,54 x
    // 6,263 is 9,64502, posted as 9,65, so the cash alone would say 1.5408.
    const [row] = statement(trade('Kupno', '1,540', '6,263', '-9,65'))

    expect(row.quantity).toBe(1.54)
    expect(row.warnings).toEqual([])
  })

  it('keeps a fractional quantity fractional', () => {
    const [row] = statement('21-07-2025,15:43,21-07-2025,INVESCO FTSE ALL WORLD UCITS ETF ACC,IE000716YHJ7,"Kupno 0,5 Invesco FTSE All World UCITS ETF Acc@10 EUR (IE000716YHJ7)",,EUR,"-5,00",EUR,"8,09",')

    expect(row.quantity).toBe(0.5)
    expect(row.warnings).toEqual([])
  })
})

describe('fees', () => {
  it('keeps a transaction fee as its own row carrying its order id', () => {
    const fees = degiro.rows.filter((row) => row.kind === 'fee')

    expect(fees).toHaveLength(expectedDegiroRowCounts.fee)
    expect(totalFor(degiro.rows, 'fee')).toBeCloseTo(-expectedDegiroFeeTotal, 2)

    const attached = fees.filter((fee) => fee.orderId)
    expect(attached).toHaveLength(12)
    for (const fee of attached) {
      expect(degiro.rows.some((row) => row.kind === 'buy' && row.orderId === fee.orderId)).toBe(true)
      expect(fee.isin).toBeDefined()
    }
  })

  it('leaves the trade row untouched by its fee', () => {
    const order = degiro.rows.filter((row) => row.orderId === 'ad5c5f46-35c4-4715-ab2f-b26733590d17')
    const buy = order.find((row) => row.kind === 'buy')
    const fee = order.find((row) => row.kind === 'fee')

    expect(buy?.amount).toBeCloseTo(-1692.9, 2)
    expect(buy?.fee).toBeUndefined()
    expect(fee?.amount).toBeCloseTo(-3, 2)
  })

  it('classifies the annual venue fee, which carries no ISIN or order id', () => {
    const venue = degiro.rows.filter((row) => row.kind === 'fee' && !row.orderId)

    expect(venue).toHaveLength(3)
    for (const fee of venue) {
      expect(fee.isin).toBeUndefined()
      expect(fee.amount).toBe(-2.5)
    }
  })
})

describe('internal transfers', () => {
  const internal = degiro.rows.filter((row) => row.kind === 'internal')

  it('classifies both legs of the cash sweep', () => {
    expect(internal).toHaveLength(expectedDegiroRowCounts.internal)
    expect(internal.filter((row) => row.raw.includes('Cash Sweep Transfer'))).toHaveLength(24)
    expect(internal.filter((row) => /Transfer (to|from) your Cash Account at/.test(row.raw))).toHaveLength(24)
  })

  it('never lets the flatex cash account look like a holding', () => {
    expect(degiro.rows.some((row) => row.raw.includes(DEGIRO_CASH_ACCOUNT_ISIN))).toBe(true)
    expect(DEGIRO_CASH_ACCOUNT_ISIN).toBe(expectedDegiroNonInstrumentIsin)

    for (const row of degiro.rows) {
      expect(row.isin).not.toBe(expectedDegiroNonInstrumentIsin)
      expect(row.instrumentName).not.toBe('FLATEX EURO BANKACCOUNT')
    }

    const instruments = new Set(degiro.rows.filter((row) => row.isin).map((row) => row.isin))
    expect(instruments.size).toBe(expectedDegiroInstrumentCount)
  })

  it('refuses the flatex cash account on a row the internal rule does not catch', () => {
    // Every fixture row carrying NLFLATEXACNT is also a sweep, so the internal
    // branch answers first and the refusal itself never runs. These are the
    // same ISIN reaching each of the other branches, which is what DeGiro
    // renaming the sweep - or translating it - would leave behind.
    const rows = statement(
      '21-07-2025,10:00,21-07-2025,FLATEX EURO BANKACCOUNT,NLFLATEXACNT,DEGIRO Opłata Transakcyjna,,EUR,"-1,00",EUR,"0,00",b1',
      '21-07-2025,10:00,21-07-2025,FLATEX EURO BANKACCOUNT,NLFLATEXACNT,Przeksięgowanie salda,,EUR,"1,00",EUR,"0,00",',
      '21-07-2025,10:00,21-07-2025,FLATEX EURO BANKACCOUNT,NLFLATEXACNT,"Kupno 10 Flatex Euro Bankaccount@1,00 EUR (NLFLATEXACNT)",,EUR,"-10,00",EUR,"0,00",b2',
      '21-07-2025,10:00,21-07-2025,,,"Kupno 10 Flatex Euro Bankaccount@1,00 EUR (NLFLATEXACNT)",,EUR,"-10,00",EUR,"0,00",b3'
    )

    expect(rows.map((row) => row.kind)).toEqual(['fee', 'unknown', 'buy', 'buy'])
    for (const row of rows) {
      expect(row.isin).toBeUndefined()
      expect(row.instrumentName).toBeUndefined()
    }
  })

  it('still gives the counterpart leg a currency, though it moves no Change', () => {
    const counterparts = internal.filter((row) => /Transfer (to|from) your Cash Account at/.test(row.raw))

    for (const row of counterparts) {
      expect(row.amount).toBe(0)
      expect(row.currency).toBe('EUR')
    }
  })

  it('leaves the cash balance right only when the internal rows are excluded', () => {
    const balances: Record<string, number> = {}
    for (const row of degiro.rows) {
      if (row.kind === 'internal') continue
      balances[row.currency] = (balances[row.currency] ?? 0) + row.amount
    }

    for (const [currency, expected] of Object.entries(expectedDegiroCashBalance)) {
      expect(balances[currency]).toBeCloseTo(expected, 2)
    }

    const withInternal = degiro.rows.reduce((sum, row) => (row.currency === 'EUR' ? sum + row.amount : sum), 0)
    expect(withInternal).not.toBeCloseTo(expectedDegiroCashBalance.EUR, 2)
  })
})

describe('cash movements', () => {
  it('classifies deposits and totals them', () => {
    expect(totalFor(degiro.rows, 'deposit')).toBeCloseTo(expectedDegiroDepositTotal, 2)
  })

  it('reads the same description as a withdrawal when the cash leaves', () => {
    const [row] = statement('21-07-2025,15:43,21-07-2025,,,Depozyt,,EUR,"-100,00",EUR,"8,09",')

    expect(row.kind).toBe('withdrawal')
  })

  it('reads the closing balance the statement states, skipping the sweep rows', () => {
    // The Balance column interleaves two accounts: a sweep row reports the
    // flatex balance the money moved to, every other row the trading account.
    // Read across both it looks unreliable; read off non-internal rows it is
    // exact, and it is the only thing that says what the account holds when an
    // export does not reach back to the account's first day.
    expect(degiro.statedBalances).toEqual(expectedDegiroStatedBalances)
  })

  it('states no balance for a file whose rows carry none', () => {
    const { statedBalances } = parseDegiro(
      [
        'Date,Time,Value date,Product,ISIN,Description,FX,Change,,Balance,,Order Id',
        '06-08-2024,09:35,05-08-2024,,,Depozyt,,EUR,"5,00",,,',
        '',
      ].join('\n')
    )

    expect(statedBalances).toEqual([])
  })

  it('classifies the quarterly interest notices and the broker credit alongside them', () => {
    expect(totalFor(degiro.rows, 'interest')).toBeCloseTo(expectedDegiroInterestTotal, 2)
    expect(totalFor(degiro.rows, 'dividend')).toBeCloseTo(expectedDegiroDividendTotal, 2)
  })

  it('books a promotional rebate as income rather than leaving it unclassified', () => {
    // Money the broker hands over for nothing, and the whole difference between
    // an import reconciling to the balance DeGiro reports and landing short of
    // it: on the real statement this row is the 5,00 EUR that closes the gap.
    const [row] = statement(
      '06-08-2024,09:35,05-08-2024,,,Promocja rabat,,EUR,"5,00",EUR,"11,00",'
    )

    expect(row.kind).toBe('interest')
    expect(row.amount).toBe(5)
    expect(row.warnings).toEqual([])
    // Filed as income, which it is, but still called what the statement called
    // it - otherwise it reads as "Interest" beside eighteen quarterly notices
    // of nothing, and the only word telling them apart is gone.
    expect(row.description).toBe('Promocja rabat')
  })

  it('leaves a genuinely unfamiliar row unclassified, with a warning rather than a silent drop', () => {
    const [row] = statement(
      '06-08-2024,09:35,05-08-2024,,,Korekta ksiegowa,,EUR,"1,23",EUR,"11,00",'
    )

    expect(row.kind).toBe('unknown')
    expect(row.amount).toBe(1.23)
    expect(row.warnings).toEqual(['No rule matched this description, so it was left unclassified'])
  })

  it('has nothing left unclassified in the fixture statement', () => {
    const unknown = degiro.rows.filter((row) => row.kind === 'unknown')

    expect(unknown.map((row) => row.raw)).toHaveLength(expectedDegiroUnknownDescriptions.length)
  })
})

describe('externalId', () => {
  it('is unique across the statement', () => {
    const ids = new Set(degiro.rows.map((row) => row.externalId))

    expect(ids.size).toBe(expectedDegiroRowTotal)
  })

  it('separates the two fills and the fee of a single order', () => {
    const order = degiro.rows.filter((row) => row.orderId === expectedDegiroPartialFillOrderId)

    expect(order).toHaveLength(expectedDegiroPartialFillRowCount)
    expect(new Set(order.map((row) => row.externalId)).size).toBe(expectedDegiroPartialFillRowCount)
    expect(order.filter((row) => row.kind === 'buy').map((row) => row.quantity).sort((a, b) => a! - b!))
      .toEqual(expectedDegiroPartialFillQuantities)
    expect(order.filter((row) => row.kind === 'fee')).toHaveLength(1)
  })

  it('separates the two halves of a quarterly interest pair posted in the same minute', () => {
    // Both are 0,00 and differ only in currency, so an identity that ignores it
    // would leave the pair indistinguishable - and an id rescued only by the
    // rows' order would swap between exports that list them the other way up.
    const eur = '30-06-2025,15:40,24-06-2025,,,Flatex Interest Income,,EUR,"0,00",EUR,"1703,99",'
    const pln = '30-06-2025,15:40,24-06-2025,,,Flatex Interest Income,,PLN,"0,00",PLN,"0,00",'

    const [first, second] = statement(eur, pln)
    const [swappedPln, swappedEur] = statement(pln, eur)

    expect(first.externalId).not.toBe(second.externalId)
    expect(swappedEur.externalId).toBe(first.externalId)
    expect(swappedPln.externalId).toBe(second.externalId)
  })

  it('separates two rows the statement repeats verbatim', () => {
    const line = '21-07-2025,10:00,21-07-2025,,,Depozyt,,EUR,"1,00",EUR,"1,00",'
    const rows = statement(line, line)

    expect(rows).toHaveLength(2)
    expect(rows[0].externalId).not.toBe(rows[1].externalId)
  })

  it('is stable across repeated parses of the same statement', () => {
    const again = parseDegiro(fixture(DEGIRO_FIXTURE))

    expect(again.rows.map((row) => row.externalId)).toEqual(degiro.rows.map((row) => row.externalId))
  })

  it('is unchanged by a re-download that only adds older history', () => {
    const text = fixture(DEGIRO_FIXTURE)
    const truncated = text.split('\n').slice(0, 30).join('\n')
    const shorter = parseDegiro(truncated)

    expect(shorter.rows.map((row) => row.externalId)).toEqual(
      degiro.rows.slice(0, shorter.rows.length).map((row) => row.externalId)
    )
  })
})

describe('malformed input', () => {
  it('warns and reads on when the header is missing', () => {
    const result = parseDegiro('21-07-2025,15:43,21-07-2025,,,Depozyt,,EUR,"1,00",EUR,"1,00",\n')

    expect(result.warnings).toEqual(['No DeGiro header found; the file was read with the standard column order'])
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].kind).toBe('deposit')
  })

  it('skips blank lines without inventing rows', () => {
    const result = parseDegiro([HEADER, '', '21-07-2025,15:43,21-07-2025,,,Depozyt,,EUR,"1,00",EUR,"1,00",', '', ''].join('\n'))

    expect(result.rows).toHaveLength(1)
  })

  it('warns on an amount it cannot read and treats the row as moving nothing', () => {
    const [row] = statement('21-07-2025,15:43,21-07-2025,,,Depozyt,,EUR,"n/a",EUR,"1,00",')

    expect(row.amount).toBe(0)
    expect(row.warnings).toContain('Unreadable amount "n/a"')
  })

  it('tolerates a row that stops short of the Order Id column', () => {
    const [row] = statement('21-07-2025,15:43,21-07-2025,,,Depozyt,,EUR,"1,00"')

    expect(row.kind).toBe('deposit')
    expect(row.amount).toBe(1)
    expect(row.orderId).toBeUndefined()
  })
})
