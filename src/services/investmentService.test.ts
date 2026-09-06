import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../lib/db-dexie'
import {
  ydoc,
  addTrade,
  addTrades,
  updateTrade,
  brokerAccounts as yBrokerAccounts,
  instruments as yInstruments,
  trades as yTrades,
} from '../lib/crdts'
import { makeExternalId } from '../lib/import/types'
import { investmentService, type ImportTradeRow } from './investmentService'

/**
 * A statement row as the DeGiro parser would hand it over: the external id is
 * derived from the row's own content, so a re-download of the same statement
 * recomputes exactly the same id.
 */
function buyRow(date: string, quantity: number, amount: number): ImportTradeRow {
  return {
    instrumentId: 'inst-1',
    kind: 'buy',
    date,
    quantity,
    price: Math.abs(amount) / quantity,
    amount,
    currency: 'EUR',
    fee: 0,
    externalId: makeExternalId('degiro', [date, 'Koop', amount, quantity]),
  }
}

const JANUARY_STATEMENT = [
  buyRow('2026-01-05T09:00:00.000Z', 3, -540.3),
  buyRow('2026-01-12T09:00:00.000Z', 2, -361.2),
  buyRow('2026-01-26T09:00:00.000Z', 5, -905),
]

// The same export downloaded a month later: every January row again, plus February.
const FEBRUARY_STATEMENT = [
  ...JANUARY_STATEMENT,
  buyRow('2026-02-09T09:00:00.000Z', 4, -728.4),
  buyRow('2026-02-23T09:00:00.000Z', 1, -183.15),
]

/** A trade whose id the caller assigned itself, as a bulk import hands it over. */
function preparedTrade(index: number) {
  return {
    _id: `trade-${index}`,
    type: 'trade' as const,
    accountId: 'acc-1',
    instrumentId: 'inst-1',
    kind: 'buy' as const,
    date: '2026-04-01T09:00:00.000Z',
    quantity: 1,
    price: 100,
    amount: -100,
    currency: 'EUR',
    fee: 0,
    externalId: `degiro:bulk-${index}`,
  }
}

function baseInstrument() {
  return {
    isin: 'IE00B5BMR087',
    ticker: 'SXR8',
    name: 'ISHARES CORE S&P 500 UCITS ETF USD',
    currency: 'EUR' as const,
    kind: 'etf' as const,
  }
}

async function waitFor(condition: () => Promise<boolean>, message: string) {
  for (let i = 0; i < 50; i++) {
    if (await condition()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(message)
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
})

describe('findOrCreateInstrument', () => {
  it('reuses the instrument with the same ISIN', async () => {
    const created = await investmentService.findOrCreateInstrument(baseInstrument())

    const found = await investmentService.findOrCreateInstrument({
      ...baseInstrument(),
      ticker: 'CSPX',
      name: 'iShares Core S&P 500 UCITS ETF USD (Acc)',
    })

    expect(found._id).toBe(created._id)
    expect(yInstruments.size).toBe(1)
  })

  it('reuses the instrument with the same ticker when the row carries no ISIN', async () => {
    const created = await investmentService.findOrCreateInstrument({
      ticker: 'VUAA',
      name: 'Vanguard S&P 500 UCITS ETF',
      currency: 'USD',
      kind: 'etf',
    })

    // Revolut statements name a holding by ticker only.
    const found = await investmentService.findOrCreateInstrument({
      ticker: 'VUAA',
      name: 'Vanguard S&P 500',
      currency: 'USD',
      kind: 'etf',
    })

    expect(found._id).toBe(created._id)
    expect(yInstruments.size).toBe(1)
  })

  it('creates an instrument when neither the ISIN nor the ticker matches', async () => {
    const first = await investmentService.findOrCreateInstrument(baseInstrument())

    const second = await investmentService.findOrCreateInstrument({
      isin: 'IE000716YHJ7',
      ticker: 'FWIA',
      name: 'INVESCO FTSE ALL WORLD UCITS ETF ACC',
      currency: 'EUR',
      kind: 'etf',
    })

    expect(second._id).not.toBe(first._id)
    expect(yInstruments.size).toBe(2)
  })

  it('keeps two securities apart when they share a ticker across exchanges', async () => {
    await investmentService.findOrCreateInstrument({
      isin: 'IE00B5BMR087',
      ticker: 'SXR8',
      name: 'iShares Core S&P 500 (Xetra)',
      currency: 'EUR',
      kind: 'etf',
    })
    const amsterdam = await investmentService.findOrCreateInstrument({
      isin: 'IE00B5BMR088',
      ticker: 'SXR8',
      name: 'iShares Core S&P 500 (Euronext)',
      currency: 'EUR',
      kind: 'etf',
    })

    const found = await investmentService.findOrCreateInstrument({
      isin: 'IE00B5BMR088',
      ticker: 'SXR8',
      name: 'iShares Core S&P 500 (Euronext)',
      currency: 'EUR',
      kind: 'etf',
    })

    expect(found._id).toBe(amsterdam._id)
    expect(yInstruments.size).toBe(2)
  })

  it('projects a created instrument into Dexie', async () => {
    const created = await investmentService.findOrCreateInstrument(baseInstrument())

    await waitFor(async () => (await db.instruments.get(created._id)) !== undefined, 'instrument never reached Dexie')

    const row = await db.instruments.get(created._id)
    expect(row?.isin).toBe('IE00B5BMR087')
    expect(row?.createdAt).toBeInstanceOf(Date)
  })
})

describe('updateInstrument', () => {
  // The symbol is resolved against a price feed after the import, so a wrong
  // guess has to be removable and not only replaceable.
  it('clears the market-data symbol when the update hands it back as undefined', async () => {
    const instrument = await investmentService.findOrCreateInstrument({ ...baseInstrument(), symbol: 'SXR8.DE' })
    await waitFor(async () => (await db.instruments.get(instrument._id)) !== undefined, 'the instrument never reached Dexie')

    const updated = await investmentService.updateInstrument(instrument._id, { symbol: undefined })

    expect(updated.symbol).toBeUndefined()
    expect(yInstruments.get(instrument._id)?.has('symbol')).toBe(false)
    await waitFor(
      async () => (await db.instruments.get(instrument._id))?.symbol === undefined,
      'the cleared symbol never left Dexie'
    )
  })
})

describe('importTrades', () => {
  it('stores every row of a first import', async () => {
    const summary = await investmentService.importTrades('acc-1', JANUARY_STATEMENT)

    expect(summary).toEqual({ inserted: 3, alreadyImported: 0, duplicateWithinFile: 0, relabelled: 0, invalid: [] })
    expect(yTrades.size).toBe(3)
  })

  it('skips the rows the previous import already stored', async () => {
    await investmentService.importTrades('acc-1', JANUARY_STATEMENT)

    const summary = await investmentService.importTrades('acc-1', FEBRUARY_STATEMENT)

    expect(summary).toEqual({ inserted: 2, alreadyImported: 3, duplicateWithinFile: 0, relabelled: 0, invalid: [] })
    expect(yTrades.size).toBe(5)
  })

  it('leaves the stored trades untouched when the whole statement is a re-import', async () => {
    await investmentService.importTrades('acc-1', JANUARY_STATEMENT)
    const before = [...yTrades.keys()].sort()

    const summary = await investmentService.importTrades('acc-1', JANUARY_STATEMENT)

    expect(summary).toEqual({ inserted: 0, alreadyImported: 3, duplicateWithinFile: 0, relabelled: 0, invalid: [] })
    expect([...yTrades.keys()].sort()).toEqual(before)
  })

  // The parser learned to carry the statement's own words after these rows were
  // already stored, and nothing else would ever put them there: a re-import
  // skips what it already has.
  it('gives an already-imported row the words the statement gave it', async () => {
    const bare = { ...buyRow('2026-01-05T09:00:00.000Z', 3, -540.3), kind: 'interest' as const }
    await investmentService.importTrades('acc-1', [bare])

    const summary = await investmentService.importTrades('acc-1', [
      { ...bare, note: 'Promocja rabat' },
    ])

    expect(summary.relabelled).toBe(1)
    expect(summary.inserted).toBe(0)
    expect([...yTrades.values()][0].get('note')).toBe('Promocja rabat')
  })

  // A note the user has written on is theirs, and a re-import is not the moment
  // to take it back.
  it('leaves a note that is already there alone', async () => {
    const bare = { ...buyRow('2026-01-05T09:00:00.000Z', 3, -540.3), kind: 'interest' as const }
    await investmentService.importTrades('acc-1', [{ ...bare, note: 'Mine' }])

    const summary = await investmentService.importTrades('acc-1', [
      { ...bare, note: 'Promocja rabat' },
    ])

    expect(summary.relabelled).toBe(0)
    expect([...yTrades.values()][0].get('note')).toBe('Mine')
  })

  it('skips a row repeated inside a single statement', async () => {
    const repeated = buyRow('2026-01-05T09:00:00.000Z', 3, -540.3)

    const summary = await investmentService.importTrades('acc-1', [repeated, repeated])

    expect(summary).toEqual({ inserted: 1, alreadyImported: 0, duplicateWithinFile: 1, relabelled: 0, invalid: [] })
    expect(yTrades.size).toBe(1)
  })

  // Two accounts at the same broker derive the same ids for their own rows, and
  // a statement imported into the wrong account is corrected by importing it
  // into the right one. Neither may be mistaken for a re-import.
  it('stores the same statement again under a second account', async () => {
    await investmentService.importTrades('acc-1', JANUARY_STATEMENT)

    const summary = await investmentService.importTrades('acc-2', JANUARY_STATEMENT)

    expect(summary).toEqual({ inserted: 3, alreadyImported: 0, duplicateWithinFile: 0, relabelled: 0, invalid: [] })
    expect(yTrades.size).toBe(6)

    await waitFor(async () => (await db.trades.count()) === 6, 'trades never reached Dexie')
    expect(await investmentService.getTradesByAccount('acc-1')).toHaveLength(3)
    expect(await investmentService.getTradesByAccount('acc-2')).toHaveLength(3)
  })

  // "You already have this" and "your file says this twice" are different
  // answers: the second means the parser's ids under-specify a row, which costs
  // the user real trades unless the summary says so.
  it('counts rows already stored apart from rows the file repeats', async () => {
    await investmentService.importTrades('acc-1', JANUARY_STATEMENT)
    const repeated = buyRow('2026-02-09T09:00:00.000Z', 4, -728.4)

    const summary = await investmentService.importTrades('acc-1', [...JANUARY_STATEMENT, repeated, repeated])

    expect(summary).toEqual({ inserted: 1, alreadyImported: 3, duplicateWithinFile: 1, relabelled: 0, invalid: [] })
    expect(yTrades.size).toBe(4)
  })

  it('imports the rows it can read and names the ones it cannot', async () => {
    // The amount column of one row was not a number the parser could read.
    const unreadable: ImportTradeRow = { ...buyRow('2026-01-12T09:00:00.000Z', 2, -361.2), amount: Number.NaN }

    const summary = await investmentService.importTrades('acc-1', [JANUARY_STATEMENT[0], unreadable, JANUARY_STATEMENT[2]])

    expect(summary.inserted).toBe(2)
    expect(summary.alreadyImported).toBe(0)
    expect(summary.invalid).toHaveLength(1)
    expect(summary.invalid[0].index).toBe(1)
    expect(summary.invalid[0].externalId).toBe(unreadable.externalId)
    expect(summary.invalid[0].reason).toContain('amount')
    expect(yTrades.size).toBe(2)
  })

  it('files the rows under the importing account', async () => {
    await investmentService.importTrades('acc-1', JANUARY_STATEMENT)
    await investmentService.importTrades('acc-2', FEBRUARY_STATEMENT.slice(3))

    await waitFor(async () => (await db.trades.count()) === 5, 'trades never reached Dexie')

    const first = await investmentService.getTradesByAccount('acc-1')
    const second = await investmentService.getTradesByAccount('acc-2')

    expect(first).toHaveLength(3)
    expect(second).toHaveLength(2)
    expect(first[0].date).toBe('2026-01-05T09:00:00.000Z')
  })

  it('projects imported trades into Dexie with real dates', async () => {
    await investmentService.importTrades('acc-1', JANUARY_STATEMENT)

    await waitFor(async () => (await db.trades.count()) === 3, 'trades never reached Dexie')

    const rows = await db.trades.where('accountId').equals('acc-1').sortBy('date')
    expect(rows[0].date).toEqual(new Date('2026-01-05T09:00:00.000Z'))
    expect(rows[0].createdAt).toBeInstanceOf(Date)
    expect(rows[0].kind).toBe('buy')
  })

  // A statement is hundreds of rows. One transaction per trade would hand the
  // sync layer one document update each, to store, upload and merge separately.
  it('adds the whole import in a single document update', async () => {
    const rows = Array.from({ length: 60 }, (_, index) =>
      buyRow(`2026-03-${String(index + 1).padStart(2, '0')}T09:00:00.000Z`, index + 1, -100 - index)
    )

    let updates = 0
    const countUpdate = () => { updates++ }
    ydoc.on('update', countUpdate)
    try {
      await investmentService.importTrades('acc-1', rows)
    } finally {
      ydoc.off('update', countUpdate)
    }

    expect(updates).toBe(1)
    expect(yTrades.size).toBe(60)
  })
})

describe('createBrokerAccount', () => {
  // Without an order of its own every account sits on 0 and the list falls back
  // to uuid order, which reshuffles itself for no reason the user can see.
  it('puts each new account after the last one', async () => {
    const first = await investmentService.createBrokerAccount({ name: 'DeGiro', broker: 'degiro' })
    await waitFor(async () => (await db.brokerAccounts.get(first._id)) !== undefined, 'the first account never reached Dexie')

    const second = await investmentService.createBrokerAccount({ name: 'Revolut', broker: 'revolut' })

    expect(first.order).toBe(0)
    expect(second.order).toBe(1)
  })

  it('keeps the order the caller asked for', async () => {
    const account = await investmentService.createBrokerAccount({ name: 'DeGiro', broker: 'degiro', order: 7 })

    expect(account.order).toBe(7)
  })
})

describe('updateBrokerAccount', () => {
  it('unlinks the cash wallet when the update hands it back as undefined', async () => {
    const account = await investmentService.createBrokerAccount({
      name: 'DeGiro',
      broker: 'degiro',
      cashWalletId: 'wallet-1',
    })
    await waitFor(async () => (await db.brokerAccounts.get(account._id)) !== undefined, 'the account never reached Dexie')

    const updated = await investmentService.updateBrokerAccount(account._id, { cashWalletId: undefined })

    expect(updated.cashWalletId).toBeUndefined()
    expect(yBrokerAccounts.get(account._id)?.has('cashWalletId')).toBe(false)
    await waitFor(
      async () => (await db.brokerAccounts.get(account._id))?.cashWalletId === undefined,
      'the unlinked wallet never left Dexie'
    )
  })
})

describe('deleteBrokerAccount', () => {
  it('takes the account trades with it and leaves the instruments alone', async () => {
    const account = await investmentService.createBrokerAccount({
      name: 'DeGiro',
      broker: 'degiro',
      order: 0,
    })
    await investmentService.findOrCreateInstrument(baseInstrument())
    await investmentService.importTrades(account._id, JANUARY_STATEMENT)
    await investmentService.importTrades('acc-other', FEBRUARY_STATEMENT.slice(3))
    await waitFor(async () => (await db.trades.count()) === 5, 'trades never reached Dexie')

    await investmentService.deleteBrokerAccount(account._id)

    expect(yBrokerAccounts.has(account._id)).toBe(false)
    expect(yTrades.size).toBe(2)
    expect(yInstruments.size).toBe(1)

    // The projection has to follow the document down, not only up: a delete the
    // observer never mirrors leaves the trades on screen and in every count.
    await waitFor(async () => (await db.trades.count()) === 2, 'the deleted trades never left Dexie')
    await waitFor(async () => (await db.brokerAccounts.get(account._id)) === undefined, 'the deleted account never left Dexie')
    expect(await db.instruments.count()).toBe(1)
  })
})

describe('trades in the document', () => {
  // A bulk import assigns the ids itself so it can report on each row, and the
  // whole statement still has to reach the sync layer as one update.
  it('keeps caller-supplied ids and inserts them in a single document update', () => {
    const prepared = Array.from({ length: 40 }, (_, index) => preparedTrade(index))

    let updates = 0
    const countUpdate = () => { updates++ }
    ydoc.on('update', countUpdate)
    let ids: string[]
    try {
      ids = addTrades(prepared)
    } finally {
      ydoc.off('update', countUpdate)
    }

    expect(updates).toBe(1)
    expect(ids).toEqual(prepared.map(trade => trade._id))
    expect(yTrades.size).toBe(40)
    expect(yTrades.get('trade-7')?.get('externalId')).toBe('degiro:bulk-7')
  })

  it('clears a trade note when the update hands it back as undefined', () => {
    const id = addTrade({ ...preparedTrade(0), note: 'partial fill' })

    updateTrade(id, { note: undefined })

    expect(yTrades.get(id)?.get('note')).toBeUndefined()
    expect(yTrades.get(id)?.has('note')).toBe(false)
  })
})
