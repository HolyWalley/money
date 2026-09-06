import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { UTCDate } from '@date-fns/utc'
import { db } from '@/lib/db-dexie'
import {
  ydoc,
  brokerAccounts as yBrokerAccounts,
  instruments as yInstruments,
  trades as yTrades,
} from '@/lib/crdts'
import { degiroParser } from '@/lib/import/degiro'
import { revolutParser } from '@/lib/import/revolut'
import type { ParsedRow } from '@/lib/import/types'
import { computePositions, type PositionTrade } from '@/lib/positions'
import { investmentService, type ImportTradeRow } from '@/services/investmentService'
import { transactionService } from '@/services/transactionService'
import type { TradeKind } from '../../../shared/schemas/trade.schema'
import {
  DEGIRO_FIXTURE,
  REVOLUT_FIXTURE,
  expectedDegiroCashBalance,
  expectedDegiroPositions,
  expectedRevolutCashBalance,
  expectedRevolutPositions,
  expectedRevolutRealisedGain,
} from '@/lib/import/__fixtures__/expected'

/**
 * A statement's whole journey: parser -> Yjs -> the Dexie projection -> back
 * out as the hooks hand it to a component -> the positions engine.
 *
 * The two parsers state a date differently. Revolut prints a true UTC instant
 * with microseconds; DeGiro prints a calendar date plus a CET/CEST wall clock
 * that its parser stamps as UTC on the day the statement named. Both cross the
 * same three boundaries here, and this app has shifted a day at every one of
 * them before, so the fixtures - which hold rows timed 00:12 and 23:59, either
 * side of midnight in any real timezone - are carried through end to end.
 */

const FIXTURES = join(__dirname, '../../lib/import/__fixtures__')

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8')
}

const IMPORTABLE: ReadonlyArray<TradeKind> = ['buy', 'sell', 'dividend', 'fee', 'interest']

function isImportable(row: ParsedRow): boolean {
  return (IMPORTABLE as readonly string[]).includes(row.kind)
}

/**
 * The rows an import would store, keyed to an instrument the way the importer
 * will: by ISIN where the statement gives one, by ticker where it does not.
 */
function toImportRows(rows: ParsedRow[]): ImportTradeRow[] {
  return rows.filter(isImportable).map((row) => ({
    instrumentId: row.isin ?? row.ticker,
    kind: row.kind as TradeKind,
    date: row.date,
    quantity: row.quantity ?? 0,
    price: row.price,
    amount: row.amount,
    currency: row.currency,
    fee: row.fee ?? 0,
    externalId: row.externalId,
  }))
}

/** The date each row's own CSV line printed, as YYYY-MM-DD. */
function statedDay(broker: 'degiro' | 'revolut', raw: string): string {
  if (broker === 'revolut') return raw.slice(0, 10)
  const match = /^(\d{2})-(\d{2})-(\d{4}),/.exec(raw)
  if (!match) throw new Error(`fixture line does not start with a DeGiro date: ${raw}`)
  return `${match[3]}-${match[2]}-${match[1]}`
}

/** What useLiveTrades hands a component: the Dexie Date back as an ISO string. */
async function readBackTrades(accountId: string) {
  const stored = await db.trades.where('accountId').equals(accountId).sortBy('date')
  return stored.map((trade) => ({ ...trade, date: trade.date.toISOString() }))
}

async function waitForProjection(accountId: string, count: number) {
  for (let i = 0; i < 50; i++) {
    if (await db.trades.where('accountId').equals(accountId).count() === count) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`the Dexie projection never reached ${count} trades for ${accountId}`)
}

beforeEach(async () => {
  ydoc.transact(() => {
    for (const id of [...yTrades.keys()]) yTrades.delete(id)
    for (const id of [...yInstruments.keys()]) yInstruments.delete(id)
    for (const id of [...yBrokerAccounts.keys()]) yBrokerAccounts.delete(id)
  })
  await db.trades.clear()
  await db.instruments.clear()
  await db.brokerAccounts.clear()
  await db.wallets.clear()
  await db.transactions.clear()
})

describe('a parsed statement stored and read back', () => {
  const statements = [
    { broker: 'degiro' as const, parsed: degiroParser.parse(fixture(DEGIRO_FIXTURE)) },
    { broker: 'revolut' as const, parsed: revolutParser.parse(fixture(REVOLUT_FIXTURE)) },
  ]

  it.each(statements)('keeps every $broker row on the calendar day the broker printed', async ({ broker, parsed }) => {
    const accountId = `acc-${broker}`
    const rows = toImportRows(parsed.rows)
    const summary = await investmentService.importTrades(accountId, rows)
    expect(summary.invalid).toEqual([])
    expect(summary.inserted).toBe(rows.length)
    await waitForProjection(accountId, rows.length)

    const dayOf = new Map(parsed.rows.filter(isImportable).map((row) => [row.externalId, statedDay(broker, row.raw)]))
    const stored = await db.trades.where('accountId').equals(accountId).toArray()

    for (const trade of stored) {
      const day = new UTCDate(trade.date)
      const asDay = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
      expect(asDay).toBe(dayOf.get(trade.externalId))
    }
    expect(stored).toHaveLength(rows.length)
  })

  it.each(statements)('hands $broker rows back as the exact instant the parser produced', async ({ broker, parsed }) => {
    const accountId = `acc-${broker}`
    const rows = toImportRows(parsed.rows)
    await investmentService.importTrades(accountId, rows)
    await waitForProjection(accountId, rows.length)

    const readBack = await readBackTrades(accountId)
    const dates = new Map(readBack.map((trade) => [trade.externalId, trade.date]))

    for (const row of rows) {
      expect(dates.get(row.externalId)).toBe(row.date)
    }
  })

  // A DeGiro date that lost its time would tie every fill of a day at
  // midnight, which is what the ordering the engine depends on is built from.
  it('keeps DeGiro rows of one day apart from each other', async () => {
    const parsed = degiroParser.parse(fixture(DEGIRO_FIXTURE))
    const rows = toImportRows(parsed.rows)
    await investmentService.importTrades('acc-degiro', rows)
    await waitForProjection('acc-degiro', rows.length)

    const readBack = await readBackTrades('acc-degiro')
    const days = new Set(readBack.map((trade) => trade.date.slice(0, 10)))
    const instants = new Set(readBack.map((trade) => trade.date))

    expect(days.size).toBeLessThan(instants.size)
    expect(instants.size).toBe(new Set(
      parsed.rows.filter(isImportable).map((row) => row.raw.slice(0, 16))
    ).size)
  })

  // The parser derives an external id from the row's own content, including
  // the date it now stamps with a time, and the service dedupes on it. A
  // second download of the same statement must therefore cost nothing.
  it.each(statements)('stores a re-downloaded $broker statement no second time', async ({ broker, parsed }) => {
    const accountId = `acc-${broker}`
    const rows = toImportRows(parsed.rows)
    await investmentService.importTrades(accountId, rows)
    await waitForProjection(accountId, rows.length)

    const again = await investmentService.importTrades(accountId, rows)

    expect(again).toEqual({
      inserted: 0,
      alreadyImported: rows.length,
      duplicateWithinFile: 0,
      relabelled: 0,
      invalid: [],
    })
    expect(await db.trades.where('accountId').equals(accountId).count()).toBe(rows.length)
  })

  it('orders the two brokers into one history, newest last', async () => {
    const degiro = toImportRows(degiroParser.parse(fixture(DEGIRO_FIXTURE)).rows)
    const revolut = toImportRows(revolutParser.parse(fixture(REVOLUT_FIXTURE)).rows)
    await investmentService.importTrades('acc-both', [...degiro, ...revolut])
    await waitForProjection('acc-both', degiro.length + revolut.length)

    const readBack = await readBackTrades('acc-both')
    const times = readBack.map((trade) => Date.parse(trade.date))

    expect(times.every((time) => Number.isFinite(time))).toBe(true)
    expect(times).toEqual([...times].sort((a, b) => a - b))

    // The two statements overlap for two years, so a date shape only one of
    // the parsers got right would sort the brokers into two blocks instead of
    // threading them together.
    const brokers = readBack.map((trade) => trade.externalId.split(':')[0])
    const handovers = brokers.filter((broker, index) => index > 0 && broker !== brokers[index - 1])
    expect(brokers[0]).toBe('revolut')
    expect(brokers[brokers.length - 1]).toBe('degiro')
    expect(handovers.length).toBeGreaterThan(2)
  })
})

describe('positions computed from what was stored', () => {
  async function positionsAfterImport(accountId: string, statement: string, parse: (text: string) => { rows: ParsedRow[] }) {
    const rows = toImportRows(parse(fixture(statement)).rows)
    await investmentService.importTrades(accountId, rows)
    await waitForProjection(accountId, rows.length)

    const readBack = await readBackTrades(accountId)
    return computePositions(readBack as PositionTrade[])
  }

  it('reaches the DeGiro fixture holdings through the whole pipeline', async () => {
    const positions = await positionsAfterImport('acc-degiro', DEGIRO_FIXTURE, degiroParser.parse)

    for (const expected of expectedDegiroPositions) {
      const position = positions.get(expected.isin!)
      expect(position, `no position for ${expected.isin}`).toBeDefined()
      expect(position!.quantity).toBe(expected.quantity)
      expect(position!.cost).toBeCloseTo(expected.cost, 2)
      expect(position!.currency).toBe(expected.currency)
      expect(position!.oversold).toBe(false)
      expect(position!.excluded).toEqual([])
    }
  })

  it('reaches the Revolut fixture holdings through the whole pipeline', async () => {
    const positions = await positionsAfterImport('acc-revolut', REVOLUT_FIXTURE, revolutParser.parse)

    for (const expected of expectedRevolutPositions) {
      const position = positions.get(expected.ticker!)
      expect(position, `no position for ${expected.ticker}`).toBeDefined()
      expect(position!.quantity).toBeCloseTo(expected.quantity, 8)
      expect(position!.cost).toBeCloseTo(expected.cost, 2)
      expect(position!.oversold).toBe(false)
      expect(position!.excluded).toEqual([])
    }

    // The full exit: stored in the same order the sale must be read in, or the
    // sell would take shares the buys had not yet delivered.
    const closed = positions.get('SPGI')!
    expect(closed.isClosed).toBe(true)
    expect(closed.oversold).toBe(false)
    expect(closed.realised).toBeCloseTo(expectedRevolutRealisedGain, 2)
  })
})

/**
 * What a statement leaves in the wallet holding the broker's cash.
 *
 * Nothing writes a transaction when a buy settles - the rows are stored as
 * trades - so the wallet is funded only by the user's own deposit transfers.
 * Unless the broker's own rows come back out of it, it reads as everything
 * ever deposited rather than as what is left to buy something with, and net
 * worth counts that money once as cash and again as the shares it bought.
 */
describe('the cash a statement leaves behind', () => {
  const cases = [
    {
      broker: 'degiro' as const,
      parsed: degiroParser.parse(fixture(DEGIRO_FIXTURE)),
      currency: 'EUR',
      // 36,230.00 of deposits, against which the file spends all but this.
      stated: expectedDegiroCashBalance.EUR,
    },
    {
      broker: 'revolut' as const,
      parsed: revolutParser.parse(fixture(REVOLUT_FIXTURE)),
      currency: 'USD',
      stated: expectedRevolutCashBalance.USD,
    },
  ]

  it.each(cases)(
    'leaves the wallet holding what $broker says the account holds',
    async ({ broker, parsed, currency, stated }) => {
      const walletId = `wallet-${broker}`
      const accountId = `acc-${broker}`
      const deposited = parsed.rows
        .filter((row) => row.kind === 'deposit' && row.currency === currency)
        .reduce((total, row) => total + row.amount, 0)

      await db.wallets.put({
        _id: walletId,
        type: 'wallet',
        name: `${broker} cash`,
        currency,
        initialBalance: 0,
        isSavings: false,
        order: 0,
        createdAt: new Date('2020-01-01'),
        updatedAt: new Date('2020-01-01'),
      })
      // The user's own transfers in, which is the only way this wallet is ever
      // paid: the import leaves deposits unticked precisely because of them.
      await db.transactions.put({
        _id: `deposits-${broker}`,
        type: 'transaction',
        transactionType: 'income',
        amount: deposited,
        currency,
        categoryId: 'category-1',
        walletId,
        date: new Date('2020-01-02'),
        createdAt: new Date('2020-01-02'),
        updatedAt: new Date('2020-01-02'),
      })
      await db.brokerAccounts.put({
        _id: accountId,
        type: 'brokerAccount',
        name: broker,
        broker,
        cashWalletId: walletId,
        order: 0,
        createdAt: new Date('2020-01-01'),
        updatedAt: new Date('2020-01-01'),
      })

      const rows = toImportRows(parsed.rows)
      await investmentService.importTrades(accountId, rows)
      await waitForProjection(accountId, rows.length)

      const balance = await transactionService.getWalletBalance(walletId)

      expect(Math.round(balance * 100) / 100).toBe(stated)
      // The point of the exercise: it is not the deposits, which is what a
      // wallet the trades never reached would still be reading.
      expect(deposited).toBeGreaterThan(stated)
    }
  )
})
