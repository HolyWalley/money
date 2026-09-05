import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { revolutParser } from './revolut'
import type { ParsedRow, ParsedRowKind } from './types'
import {
  REVOLUT_FIXTURE,
  expectedRevolutRowTotal,
  expectedRevolutRowCounts,
  expectedRevolutCurrencies,
  expectedRevolutPositions,
  expectedRevolutClosedTickers,
  expectedRevolutCashBalance,
  expectedRevolutInternalCashAmount,
  expectedRevolutDepositTotal,
  expectedRevolutFeeTotal,
  expectedRevolutInterestTotal,
  expectedRevolutDividendTotals,
  expectedRevolutDividendTotal,
  expectedRevolutRealisedGain,
  expectedRevolutSaleProceeds,
  expectedRevolutSaleCostBasis,
  type ExpectedRowCounts,
} from './__fixtures__/expected'

const HEADER = 'Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate'

const fixture = readFileSync(
  join(process.cwd(), 'src/lib/import/__fixtures__', REVOLUT_FIXTURE),
  'utf8'
)

function statement(...rows: string[]): string {
  return [HEADER, ...rows].join('\n') + '\n'
}

function countByKind(rows: ParsedRow[]): ExpectedRowCounts {
  const counts: ExpectedRowCounts = {
    buy: 0, sell: 0, dividend: 0, fee: 0, interest: 0,
    deposit: 0, withdrawal: 0, internal: 0, unknown: 0,
  }
  for (const row of rows) {
    counts[row.kind]++
  }
  return counts
}

function sumAmounts(rows: ParsedRow[]): number {
  return rows.reduce((total, row) => total + row.amount, 0)
}

function ofKind(rows: ParsedRow[], kind: ParsedRowKind): ParsedRow[] {
  return rows.filter((row) => row.kind === kind)
}

describe('revolutParser', () => {
  describe('detect', () => {
    it('recognises the Revolut trading header', () => {
      expect(revolutParser.detect(fixture)).toBe(true)
    })

    it('recognises the header through a BOM and CRLF line endings', () => {
      expect(revolutParser.detect(`\ufeff${HEADER}\r\n`)).toBe(true)
    })

    it('recognises the named columns in any order', () => {
      expect(revolutParser.detect('Type,Total Amount,Ticker,Price per share,Date,Quantity,Currency\n')).toBe(true)
    })

    it('is no stricter than the parser about a column Revolut has added', () => {
      const extended = 'Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate,Base currency amount\n'
        + '2024-07-15T13:37:53.778Z,SPGI,BUY - MARKET,0.03009419,USD 332.29,USD 10,USD,0.2294,PLN 40.23\n'
      const parsed = revolutParser.parse(extended)

      expect(revolutParser.detect(extended)).toBe(true)
      expect(parsed.rows[0].kind).toBe('buy')
      expect(parsed.rows[0].amount).toBe(-10)
      expect(parsed.rows.flatMap((row) => row.warnings)).toEqual([])
    })

    it('rejects a DeGiro statement', () => {
      const degiro = 'Data,Czas,Data waluty,Produkt,ISIN,Opis,FX,Zmiana,,Saldo,,ID Zlecenia\n'
      expect(revolutParser.detect(degiro)).toBe(false)
    })

    it('rejects a header missing the columns that identify the export', () => {
      expect(revolutParser.detect('Date,Ticker,Type,Quantity,Currency\n')).toBe(false)
    })

    it('rejects text that is not a statement', () => {
      expect(revolutParser.detect('')).toBe(false)
      expect(revolutParser.detect('hello,world\n')).toBe(false)
    })
  })

  describe('the fixture statement', () => {
    const parsed = revolutParser.parse(fixture)

    it('reports the broker and every source row', () => {
      expect(parsed.broker).toBe('revolut')
      expect(parsed.rows).toHaveLength(expectedRevolutRowTotal)
    })

    it('classifies every row as expected', () => {
      expect(countByKind(parsed.rows)).toEqual(expectedRevolutRowCounts)
    })

    it('lists the statement currencies', () => {
      expect(parsed.currencies).toEqual(expectedRevolutCurrencies)
      expect(parsed.rows.every((row) => row.currency === 'USD')).toBe(true)
    })

    it('parses cleanly, with no row or statement warnings', () => {
      expect(parsed.warnings).toEqual([])
      expect(parsed.rows.flatMap((row) => row.warnings)).toEqual([])
    })

    it('keeps the original line on every row', () => {
      const lines = fixture.trim().split('\n').slice(1)
      expect(parsed.rows.map((row) => row.raw)).toEqual(lines)
    })

    it('parses the same statement through a BOM and CRLF line endings', () => {
      const roundTripped = revolutParser.parse(`\ufeff${fixture.replace(/\n/g, '\r\n')}`)

      expect(roundTripped.rows.map((row) => row.externalId)).toEqual(parsed.rows.map((row) => row.externalId))
      expect(roundTripped.rows.flatMap((row) => row.warnings)).toEqual([])
    })

    it('charges no commission anywhere', () => {
      expect(parsed.rows.every((row) => row.fee === 0)).toBe(true)
      expect(sumAmounts(ofKind(parsed.rows, 'fee'))).toBe(expectedRevolutFeeTotal)
      expect(sumAmounts(ofKind(parsed.rows, 'interest'))).toBe(expectedRevolutInterestTotal)
    })

    it('reconciles the cash balance once internal rows are excluded', () => {
      const importable = parsed.rows.filter((row) => row.kind !== 'internal')
      expect(sumAmounts(importable)).toBeCloseTo(expectedRevolutCashBalance.USD, 2)
      // Counting the entity-to-entity cash move again overstates the balance.
      expect(sumAmounts(parsed.rows)).toBeCloseTo(
        expectedRevolutCashBalance.USD + expectedRevolutInternalCashAmount,
        2
      )
    })
  })

  describe('the TRANSFER traps', () => {
    const parsed = revolutParser.parse(fixture)
    const internal = ofKind(parsed.rows, 'internal')

    it('books the share migration as internal, not as a purchase', () => {
      const migration = internal.find((row) => row.ticker === 'SPGI')
      expect(migration).toBeDefined()
      expect(migration?.kind).toBe('internal')
      expect(migration?.quantity).toBe(0.07141837)
      expect(migration?.price).toBeUndefined()
      expect(migration?.amount).toBe(0)
    })

    it('does not double the migrated position or halve its cost basis', () => {
      const spgiBought = ofKind(parsed.rows, 'buy').filter((row) => row.ticker === 'SPGI')
      const quantity = spgiBought.reduce((total, row) => total + (row.quantity ?? 0), 0)
      const cost = -sumAmounts(spgiBought)

      expect(spgiBought).toHaveLength(2)
      expect(quantity).toBeCloseTo(0.17949727, 8)
      expect(cost).toBeCloseTo(expectedRevolutSaleCostBasis, 2)
    })

    it('books the cash migration as internal, not as income', () => {
      const cashMove = internal.find((row) => !row.ticker)
      expect(cashMove).toBeDefined()
      expect(cashMove?.kind).toBe('internal')
      expect(cashMove?.amount).toBeCloseTo(expectedRevolutInternalCashAmount, 2)
      expect(cashMove?.quantity).toBe(0)
    })

    it('excludes the migrated cash from dividend income', () => {
      const dividends = ofKind(parsed.rows, 'dividend')
      const perTicker = new Map<string, number>()
      for (const row of dividends) {
        perTicker.set(row.ticker ?? '', (perTicker.get(row.ticker ?? '') ?? 0) + row.amount)
      }

      expect(sumAmounts(dividends)).toBeCloseTo(expectedRevolutDividendTotal, 2)
      expect(perTicker.get('SPGI')).toBeCloseTo(expectedRevolutDividendTotals.SPGI, 2)
      expect(perTicker.get('ABEV')).toBeCloseTo(expectedRevolutDividendTotals.ABEV, 2)
      // A dividend row always names its holding, so an untickered cash move
      // could only ever have got in here by being misclassified.
      expect(dividends.every((row) => row.ticker)).toBe(true)
    })

    it('treats a quantity with no price and a zero total as internal even when the type says BUY', () => {
      const mislabelled = revolutParser.parse(statement(
        '2022-06-19T12:21:42.335784Z,SPGI,BUY - MARKET,0.03009419,,USD 0,USD,0.2459'
      ))

      expect(mislabelled.rows[0].kind).toBe('internal')
      expect(mislabelled.rows[0].quantity).toBe(0.03009419)
      expect(mislabelled.rows[0].warnings).toContainEqual(
        expect.stringContaining('internal position migration')
      )
    })

    it('leaves an unrecognised corporate action of the same shape for review', () => {
      const split = revolutParser.parse(statement(
        '2022-06-19T12:21:42.335784Z,SPGI,STOCK SPLIT,0.03009419,,USD 0,USD,0.2459'
      ))

      expect(split.rows[0].kind).toBe('unknown')
      expect(split.rows[0].warnings).toContainEqual(expect.stringContaining('STOCK SPLIT'))
    })

    it('still books a genuine zero-price row with a total as a trade', () => {
      const gift = revolutParser.parse(statement(
        '2022-06-19T12:21:42.335784Z,SPGI,BUY - MARKET,0.03009419,,USD 10,USD,0.2459'
      ))

      expect(gift.rows[0].kind).toBe('buy')
      expect(gift.rows[0].amount).toBe(-10)
    })
  })

  describe('positions', () => {
    const parsed = revolutParser.parse(fixture)

    it('preserves a fractional quantity to eight decimal places', () => {
      const [expectedPosition] = expectedRevolutPositions
      const bought = ofKind(parsed.rows, 'buy').find((row) => row.ticker === expectedPosition.ticker)

      expect(bought?.quantity).toBe(expectedPosition.quantity)
      expect(bought?.quantity).toBe(511.30456789)
      expect(-(bought?.amount ?? 0)).toBeCloseTo(expectedPosition.cost, 2)
      expect(bought?.currency).toBe(expectedPosition.currency)
    })

    it('sells the closed ticker in full', () => {
      const [closed] = expectedRevolutClosedTickers
      const bought = ofKind(parsed.rows, 'buy')
        .filter((row) => row.ticker === closed)
        .reduce((total, row) => total + (row.quantity ?? 0), 0)
      const sold = ofKind(parsed.rows, 'sell')
        .filter((row) => row.ticker === closed)
        .reduce((total, row) => total + (row.quantity ?? 0), 0)

      expect(sold).toBeCloseTo(bought, 8)
    })

    it('realises the statement gain from the cash columns', () => {
      const spgi = parsed.rows.filter((row) => row.ticker === 'SPGI' && (row.kind === 'buy' || row.kind === 'sell'))
      expect(sumAmounts(spgi)).toBeCloseTo(expectedRevolutRealisedGain, 2)
    })

    it('totals the deposits without counting them as trades', () => {
      const deposits = ofKind(parsed.rows, 'deposit')
      expect(sumAmounts(deposits)).toBeCloseTo(expectedRevolutDepositTotal, 2)
      expect(deposits.every((row) => !row.ticker && row.quantity === 0)).toBe(true)
    })
  })

  describe('amounts', () => {
    it('strips the currency code prefixing an amount', () => {
      const parsed = revolutParser.parse(statement(
        '2024-07-15T13:37:53.778Z,SPGI,BUY - MARKET,0.03009419,USD 332.29,USD 10,USD,0.2294'
      ))

      expect(parsed.rows[0].price).toBe(332.29)
      expect(parsed.rows[0].amount).toBe(-10)
      expect(parsed.rows[0].currency).toBe('USD')
    })

    it('lets the Currency column win over the code prefixing the amount, and warns', () => {
      const parsed = revolutParser.parse(statement(
        '2024-07-15T13:37:53.778Z,SPGI,DIVIDEND,,,EUR 10,USD,0.2294'
      ))

      expect(parsed.rows[0].currency).toBe('USD')
      expect(parsed.rows[0].warnings).toContainEqual(expect.stringContaining('EUR'))
    })

    it('signs the cash effect by what the row does to the account', () => {
      const parsed = revolutParser.parse(statement(
        '2024-01-02T10:00:00.000Z,,CASH TOP-UP,,,USD 100,USD,0.2294',
        '2024-01-03T10:00:00.000Z,SPGI,BUY - MARKET,0.1,USD 300,USD 30,USD,0.2294',
        '2024-01-04T10:00:00.000Z,SPGI,SELL - LIMIT,0.1,USD 320,USD 32,USD,0.2294',
        '2024-01-05T10:00:00.000Z,SPGI,DIVIDEND,,,USD 1.25,USD,0.2294',
        '2024-01-06T10:00:00.000Z,,CASH WITHDRAWAL,,,USD 50,USD,0.2294'
      ))

      expect(parsed.rows.map((row) => row.amount)).toEqual([100, -30, 32, 1.25, -50])
      expect(parsed.rows.map((row) => row.kind)).toEqual(['deposit', 'buy', 'sell', 'dividend', 'withdrawal'])
    })

    it('takes a sell from the Total Amount column rather than quantity x price', () => {
      const parsed = revolutParser.parse(fixture)
      const [sale] = ofKind(parsed.rows, 'sell')

      expect(sale.amount).toBe(expectedRevolutSaleProceeds)
      expect(sale.amount).toBeGreaterThan(0)
      expect(sale.price).toBe(455.25)
      expect(sale.quantity).toBe(0.17949727)
      // What quantity x price would have booked instead.
      expect((sale.quantity ?? 0) * (sale.price ?? 0)).toBeGreaterThan(sale.amount)
    })

    it('warns rather than corrects when the total is out beyond the price rounding', () => {
      const parsed = revolutParser.parse(statement(
        '2024-07-15T13:37:53.778Z,SPGI,SELL - MARKET,0.0860102,USD 478.90,USD 41.17,USD,0.2294'
      ))

      expect(parsed.rows[0].amount).toBe(41.17)
      expect(parsed.rows[0].warnings).toContainEqual(expect.stringContaining('quantity x price'))
    })

    it('stays quiet when the gap is only the rounding of an implied price', () => {
      const parsed = revolutParser.parse(statement(
        '2023-07-10T13:38:31.510Z,ABEV,BUY - MARKET,511.30456789,USD 2.39,USD 1220.05,USD,0.2573'
      ))

      expect(parsed.rows[0].warnings).toEqual([])
    })

    it('gives a dividend zero quantity, no price and a positive amount', () => {
      const parsed = revolutParser.parse(fixture)
      const dividends = ofKind(parsed.rows, 'dividend')

      expect(dividends).toHaveLength(expectedRevolutRowCounts.dividend)
      expect(dividends.every((row) => row.quantity === 0)).toBe(true)
      expect(dividends.every((row) => row.price === undefined)).toBe(true)
      expect(dividends.every((row) => row.amount > 0)).toBe(true)
      expect(dividends[0].amount).toBe(0.05)
    })
  })

  describe('timestamps', () => {
    it('normalises microsecond precision to a valid ISO 8601 instant', () => {
      const parsed = revolutParser.parse(statement(
        '2022-12-27T14:30:56.096721Z,SPGI,DIVIDEND,,,USD 1,USD,0.2294',
        '2024-07-15T13:37:53.778Z,SPGI,DIVIDEND,,,USD 1,USD,0.2294'
      ))

      expect(parsed.rows.map((row) => row.date)).toEqual([
        '2022-12-27T14:30:56.096Z',
        '2024-07-15T13:37:53.778Z',
      ])
      expect(parsed.rows.every((row) => !Number.isNaN(Date.parse(row.date)))).toBe(true)
    })

    it('reads a timestamp that lost its Z as the UTC the format states', () => {
      const line = '2024-01-05T00:30:00.000,ABEV,DIVIDEND,,,USD 1,USD,0.2420'
      const machineTimezone = process.env.TZ

      try {
        // Either side of the date line, so a timestamp read in local time
        // lands on a different calendar day in one of the two.
        process.env.TZ = 'Pacific/Kiritimati'
        const ahead = revolutParser.parse(statement(line))
        process.env.TZ = 'Pacific/Midway'
        const behind = revolutParser.parse(statement(line))

        expect(ahead.rows[0].date).toBe('2024-01-05T00:30:00.000Z')
        expect(behind.rows[0].date).toBe('2024-01-05T00:30:00.000Z')
      } finally {
        process.env.TZ = machineTimezone
      }
    })

    it('keeps a stated offset rather than assuming UTC', () => {
      const parsed = revolutParser.parse(statement(
        '2024-01-05T02:30:00.000+02:00,ABEV,DIVIDEND,,,USD 1,USD,0.2420'
      ))

      expect(parsed.rows[0].date).toBe('2024-01-05T00:30:00.000Z')
    })

    it('keeps the statement order, oldest row first', () => {
      const parsed = revolutParser.parse(fixture)
      const dates = parsed.rows.map((row) => Date.parse(row.date))

      expect(dates[0]).toBeLessThan(dates[dates.length - 1])
      expect([...dates].sort((a, b) => a - b)).toEqual(dates)
    })

    it('keeps a row with an unreadable date and says so', () => {
      const parsed = revolutParser.parse(statement(
        'not a date,SPGI,DIVIDEND,,,USD 1,USD,0.2294'
      ))

      expect(parsed.rows).toHaveLength(1)
      expect(parsed.rows[0].warnings).toContainEqual(expect.stringContaining('Unrecognised date'))
    })
  })

  describe('externalId', () => {
    it('is stable across re-parses of the same statement', () => {
      const first = revolutParser.parse(fixture)
      const second = revolutParser.parse(fixture)

      expect(second.rows.map((row) => row.externalId)).toEqual(first.rows.map((row) => row.externalId))
    })

    it('is unique across the statement', () => {
      const parsed = revolutParser.parse(fixture)
      const ids = new Set(parsed.rows.map((row) => row.externalId))

      expect(ids.size).toBe(parsed.rows.length)
      expect(parsed.rows.every((row) => row.externalId.startsWith('revolut:'))).toBe(true)
    })

    it('does not shift when a re-download carries more history', () => {
      const lines = fixture.trim().split('\n')
      const shortened = [lines[0], ...lines.slice(1, 6)].join('\n')

      const earlier = revolutParser.parse(shortened)
      const later = revolutParser.parse(fixture)

      expect(earlier.rows.map((row) => row.externalId))
        .toEqual(later.rows.slice(0, earlier.rows.length).map((row) => row.externalId))
    })

    it('separates rows that differ only in the microseconds of their timestamp', () => {
      const parsed = revolutParser.parse(statement(
        '2022-06-19T12:21:42.335784Z,SPGI,DIVIDEND,,,USD 1,USD,0.2459',
        '2022-06-19T12:21:42.355536Z,SPGI,DIVIDEND,,,USD 1,USD,0.2459'
      ))

      expect(parsed.rows[0].externalId).not.toBe(parsed.rows[1].externalId)
      expect(parsed.rows.flatMap((row) => row.warnings)).toEqual([])
    })

    it('survives a re-export that writes the same numbers differently', () => {
      const rows = [
        '2023-07-10T13:37:53.778Z,SPGI,SELL - MARKET,0.17949727,USD 455.25,USD 81.71,USD,0.2573',
        '2021-12-20T17:07:17.157192Z,,CASH TOP-UP,,,USD 25,USD,0.2294',
      ]
      const reformatted = [
        '2023-07-10T13:37:53.778Z,SPGI,SELL - MARKET,0.179497270,USD 455.250,USD 81.7100,USD,0.2573',
        '2021-12-20T17:07:17.157192Z,,CASH TOP-UP,,,USD 25.00,USD,0.2294',
      ]

      const asWritten = revolutParser.parse(statement(...rows))
      const restyled = revolutParser.parse(statement(...reformatted))

      // Hashing the field text instead would re-import the whole history the
      // day Revolut starts padding its amounts to two decimals.
      expect(restyled.rows.map((row) => row.externalId))
        .toEqual(asWritten.rows.map((row) => row.externalId))
    })

    it('survives a re-export that writes a ticker or a type in another case', () => {
      const asWritten = revolutParser.parse(statement(
        '2024-01-02T10:00:00.000Z,SPGI,BUY - MARKET,0.1,USD 300,USD 30,USD,0.2294'
      ))
      const restyled = revolutParser.parse(statement(
        '2024-01-02T10:00:00.000Z,spgi,Buy - Market,0.1,USD 300,USD 30,USD,0.2294'
      ))

      expect(restyled.rows[0].kind).toBe('buy')
      expect(restyled.rows[0].externalId).toBe(asWritten.rows[0].externalId)
    })

    it('separates two rows of the same size in different currencies', () => {
      const parsed = revolutParser.parse(statement(
        '2024-01-02T10:00:00.000Z,,CASH TOP-UP,,,USD 100,USD,1',
        '2024-01-02T10:00:00.000Z,,CASH TOP-UP,,,EUR 100,EUR,1'
      ))

      // The amount is hashed as a number, so a currency left out of the id
      // would make the second row a repeat of the first and import it once.
      expect(parsed.rows[0].externalId).not.toBe(parsed.rows[1].externalId)
      expect(parsed.rows.flatMap((row) => row.warnings))
        .not.toContainEqual(expect.stringContaining('Identical to an earlier row'))
    })

    it('still separates rows that differ in a value rather than in its formatting', () => {
      const parsed = revolutParser.parse(statement(
        '2024-01-02T10:00:00.000Z,SPGI,BUY - MARKET,0.1,USD 300,USD 30,USD,0.2294',
        '2024-01-02T10:00:00.000Z,SPGI,BUY - MARKET,0.1,USD 300,USD 30.01,USD,0.2294',
        '2024-01-02T10:00:00.000Z,SPGI,BUY - MARKET,0.2,USD 300,USD 30,USD,0.2294',
        '2024-01-02T10:00:00.000Z,ABEV,BUY - MARKET,0.1,USD 300,USD 30,USD,0.2294',
        '2024-01-02T10:00:00.000Z,SPGI,SELL - LIMIT,0.1,USD 300,USD 30,USD,0.2294'
      ))
      const ids = new Set(parsed.rows.map((row) => row.externalId))

      expect(ids.size).toBe(parsed.rows.length)
      expect(parsed.rows.flatMap((row) => row.warnings))
        .not.toContainEqual(expect.stringContaining('Identical to an earlier row'))
    })

    it('flags a row repeated verbatim rather than silently collapsing it', () => {
      const line = '2022-06-19T12:21:42.335784Z,SPGI,DIVIDEND,,,USD 1,USD,0.2459'
      const parsed = revolutParser.parse(statement(line, line))

      expect(parsed.rows[0].externalId).toBe(parsed.rows[1].externalId)
      expect(parsed.rows[0].warnings).toEqual([])
      expect(parsed.rows[1].warnings).toContainEqual(expect.stringContaining('Identical to an earlier row'))
    })
  })

  describe('rows it cannot map', () => {
    it('surfaces an unknown type without asserting a cash direction it cannot know', () => {
      const parsed = revolutParser.parse(statement(
        '2024-07-15T13:37:53.778Z,SPGI,STOCK SPLIT,1.5,,USD 12.34,USD,0.2294'
      ))

      expect(parsed.rows[0].kind).toBe('unknown')
      // Revolut writes amounts unsigned, so +12.34 would be as much a guess as
      // -12.34: the row is kept but moves no balance.
      expect(parsed.rows[0].amount).toBe(0)
      expect(sumAmounts(parsed.rows)).toBe(0)
      expect(parsed.rows[0].warnings).toContainEqual(expect.stringContaining('STOCK SPLIT'))
      // The magnitude is not lost, only kept out of the balance.
      expect(parsed.rows[0].warnings).toContainEqual(expect.stringContaining('USD 12.34'))
      expect(parsed.rows[0].raw).toContain('USD 12.34')
    })

    it('takes a fee out of the balance under a spelling it has not seen, and says it guessed', () => {
      const parsed = revolutParser.parse(statement(
        '2024-01-02T10:00:00.000Z,,CASH TOP-UP,,,USD 100,USD,0.2294',
        '2024-02-01T00:00:00.000Z,,CUSTODY FEE,,,USD 1.20,USD,0.2294'
      ))

      expect(parsed.rows[1].kind).toBe('fee')
      expect(parsed.rows[1].amount).toBe(-1.20)
      // Booked as income the balance would read 101.20: out by twice the fee.
      expect(sumAmounts(parsed.rows)).toBeCloseTo(98.80, 2)
      expect(parsed.rows[1].warnings).toContainEqual(expect.stringContaining('CUSTODY FEE'))
    })

    it('reads a withdrawal-shaped type as money leaving, and says it guessed', () => {
      const parsed = revolutParser.parse(statement(
        '2024-02-01T00:00:00.000Z,,WITHDRAWAL,,,USD 50,USD,0.2294'
      ))

      expect(parsed.rows[0].kind).toBe('withdrawal')
      expect(parsed.rows[0].amount).toBe(-50)
      expect(parsed.rows[0].warnings).toContainEqual(expect.stringContaining('WITHDRAWAL'))
    })

    it('leaves the spellings it does know unguessed and unwarned', () => {
      const parsed = revolutParser.parse(statement(
        '2024-01-06T10:00:00.000Z,,CASH WITHDRAWAL,,,USD 50,USD,0.2294'
      ))

      expect(parsed.rows[0].kind).toBe('withdrawal')
      expect(parsed.rows[0].warnings).toEqual([])
    })

    it('warns about a row whose field count does not match the header', () => {
      const parsed = revolutParser.parse(statement(
        '2024-07-15T13:37:53.778Z,SPGI,DIVIDEND,,,USD 1,USD'
      ))

      expect(parsed.rows[0].kind).toBe('dividend')
      expect(parsed.rows[0].warnings).toContainEqual(expect.stringContaining('expected 8'))
    })

    it('degrades to a statement-level warning when the columns it needs are missing', () => {
      const parse = () => revolutParser.parse('Date,Ticker,Quantity\n2024-07-15T13:37:53.778Z,SPGI,1\n')

      // A UI that lets the user pick the broker rather than sniffing it would
      // otherwise crash the import screen on an uncaught error.
      expect(parse).not.toThrow()
      const parsed = parse()
      expect(parsed.broker).toBe('revolut')
      expect(parsed.rows).toEqual([])
      expect(parsed.warnings).toContainEqual(expect.stringContaining('type, total amount'))
    })

    it('degrades on an empty file rather than throwing', () => {
      const parse = () => revolutParser.parse('   \n\n')

      expect(parse).not.toThrow()
      const parsed = parse()
      expect(parsed.rows).toEqual([])
      expect(parsed.currencies).toEqual([])
      expect(parsed.warnings).toContainEqual(expect.stringContaining('empty'))
    })

    it('degrades on a statement in another broker format rather than throwing', () => {
      const degiro = 'Data,Czas,Data waluty,Produkt,ISIN,Opis,FX,Zmiana,,Saldo,,ID Zlecenia\n'
        + '02-01-2024,10:00,02-01-2024,,,Depozyt,,PLN,100,PLN,100,\n'
      const parse = () => revolutParser.parse(degiro)

      expect(parse).not.toThrow()
      expect(parse().rows).toEqual([])
      expect(parse().warnings).toHaveLength(1)
    })

    it('warns about a header with no rows under it', () => {
      const parsed = revolutParser.parse(statement())
      expect(parsed.rows).toEqual([])
      expect(parsed.warnings).toContainEqual(expect.stringContaining('no rows'))
    })
  })
})
