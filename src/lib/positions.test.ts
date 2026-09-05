import { describe, it, expect } from 'vitest'
import { UTCDate } from '@date-fns/utc'
import {
  computePositions,
  createQuantityLookup,
  quantityHeldOn,
  summarizePortfolio,
  type Position,
  type PositionTrade,
  type PriceLookup,
} from './positions'
import type { Converter } from './currency-conversion'
import {
  expectedDegiroDividendTotal,
  expectedDegiroFeeTotal,
  expectedDegiroInstrumentCount,
  expectedDegiroLargestBuyQuantity,
  expectedDegiroPartialFillQuantities,
  expectedDegiroPositions,
  expectedDegiroRealisedGain,
  expectedDegiroRowCounts,
  expectedRevolutClosedTickers,
  expectedRevolutDividendTotal,
  expectedRevolutDividendTotals,
  expectedRevolutPositions,
  expectedRevolutRealisedGain,
  expectedRevolutSaleCostBasis,
  expectedRevolutSaleProceeds,
} from './import/__fixtures__/expected'

// The schema signs a trade the way the statement does: money leaving the
// account is negative, so the builders take a positive figure and sign it.
function buy(instrumentId: string, date: string, quantity: number, amount: number, currency = 'USD'): PositionTrade {
  return { instrumentId, kind: 'buy', date, quantity, amount: -amount, currency }
}

function sell(instrumentId: string, date: string, quantity: number, amount: number, currency = 'USD'): PositionTrade {
  return { instrumentId, kind: 'sell', date, quantity, amount, currency }
}

function dividend(instrumentId: string, date: string, amount: number, currency = 'USD'): PositionTrade {
  return { instrumentId, kind: 'dividend', date, quantity: 0, amount, currency }
}

function fee(date: string, amount: number, instrumentId?: string, currency = 'USD'): PositionTrade {
  return { instrumentId, kind: 'fee', date, quantity: 0, amount: -amount, currency }
}

function interest(date: string, amount: number, instrumentId?: string, currency = 'USD'): PositionTrade {
  return { instrumentId, kind: 'interest', date, quantity: 0, amount, currency }
}

function held(positions: Map<string, Position>, instrumentId: string): Position {
  const position = positions.get(instrumentId)
  if (!position) throw new Error(`no position for ${instrumentId}`)
  return position
}

function position(overrides: Partial<Position> & Pick<Position, 'instrumentId'>): Position {
  return {
    quantity: 0,
    cost: 0,
    averageCost: 0,
    realised: 0,
    dividends: 0,
    fees: 0,
    currency: 'EUR',
    isClosed: false,
    oversold: false,
    unquantified: false,
    excluded: [],
    ...overrides,
  }
}

function positionMap(...positions: Position[]): Map<string, Position> {
  return new Map(positions.map((entry) => [entry.instrumentId, entry]))
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items]

  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest])
  )
}

// Base currency is EUR; USD is halved so a converted figure is visibly not the
// raw one, and anything else has no rate at all.
const convert: Converter = (amount, currency) => {
  if (currency === 'EUR') return amount
  if (currency === 'USD') return amount / 2
  return null
}

const noPrices: PriceLookup = () => null

describe('computePositions', () => {
  it('adds a buy to the quantity and the cost basis', () => {
    const positions = computePositions([buy('i-1', '2024-01-10', 10, 1000)])

    expect(held(positions, 'i-1')).toMatchObject({
      instrumentId: 'i-1',
      quantity: 10,
      cost: 1000,
      averageCost: 100,
      currency: 'USD',
      isClosed: false,
    })
  })

  it('averages the cost across buys made at different prices', () => {
    const positions = computePositions([
      buy('i-1', '2024-01-10', 10, 1000),
      buy('i-1', '2024-02-10', 10, 2000),
    ])

    expect(held(positions, 'i-1').quantity).toBe(20)
    expect(held(positions, 'i-1').cost).toBe(3000)
    expect(held(positions, 'i-1').averageCost).toBe(150)
  })

  it('realises a partial sale against the average cost, not the last price paid', () => {
    const positions = computePositions([
      buy('i-1', '2024-01-10', 10, 1000),
      buy('i-1', '2024-02-10', 10, 2000),
      sell('i-1', '2024-03-10', 5, 1000),
    ])

    // 1000 received against 5 x 150 of basis.
    expect(held(positions, 'i-1').realised).toBeCloseTo(250, 8)
    expect(held(positions, 'i-1').quantity).toBe(15)
    expect(held(positions, 'i-1').cost).toBeCloseTo(2250, 8)
    expect(held(positions, 'i-1').averageCost).toBeCloseTo(150, 8)
  })

  it('realises a loss as a negative figure', () => {
    const positions = computePositions([
      buy('i-1', '2024-01-10', 10, 1000),
      sell('i-1', '2024-03-10', 5, 400),
    ])

    expect(held(positions, 'i-1').realised).toBeCloseTo(-100, 8)
  })

  it('closes a position sold in full and keeps the gain it made', () => {
    const positions = computePositions([
      buy('i-1', '2024-01-10', 10, 1000),
      sell('i-1', '2024-03-10', 10, 1400),
    ])

    expect(held(positions, 'i-1')).toMatchObject({
      quantity: 0,
      cost: 0,
      averageCost: 0,
      isClosed: true,
    })
    expect(held(positions, 'i-1').realised).toBeCloseTo(400, 8)
  })

  // Dropping it would erase the only record that the money was ever made.
  it('keeps a fully sold position in the map with its dividends', () => {
    const positions = computePositions([
      buy('i-1', '2024-01-10', 10, 1000),
      dividend('i-1', '2024-02-10', 12),
      sell('i-1', '2024-03-10', 10, 1400),
    ])

    expect(positions.has('i-1')).toBe(true)
    expect(held(positions, 'i-1').isClosed).toBe(true)
    expect(held(positions, 'i-1').dividends).toBe(12)
  })

  it('leaves quantity and cost basis untouched when a dividend is paid', () => {
    const positions = computePositions([
      buy('i-1', '2024-01-10', 10, 1000),
      dividend('i-1', '2024-02-10', 25),
      dividend('i-1', '2024-05-10', 25),
    ])

    expect(held(positions, 'i-1').quantity).toBe(10)
    expect(held(positions, 'i-1').cost).toBe(1000)
    expect(held(positions, 'i-1').averageCost).toBe(100)
    expect(held(positions, 'i-1').dividends).toBe(50)
  })

  it('attributes a fee to its instrument without moving the cost basis', () => {
    const positions = computePositions([
      buy('i-1', '2024-01-10', 10, 1000),
      fee('2024-01-10', 2.5, 'i-1'),
    ])

    expect(held(positions, 'i-1').fees).toBe(2.5)
    expect(held(positions, 'i-1').cost).toBe(1000)
    expect(held(positions, 'i-1').averageCost).toBe(100)
  })

  it('ignores a fee charged to the account rather than to a holding', () => {
    const positions = computePositions([
      buy('i-1', '2024-01-10', 10, 1000),
      fee('2024-06-30', 30.5),
    ])

    expect(positions.size).toBe(1)
    expect(held(positions, 'i-1').fees).toBe(0)
  })

  it('ignores interest and adjustment rows even when they name an instrument', () => {
    const positions = computePositions([
      buy('i-1', '2024-01-10', 10, 1000),
      interest('2024-03-31', 4, 'i-1'),
      { instrumentId: 'i-1', kind: 'adjustment', date: '2024-04-01', quantity: 3, amount: 99, currency: 'USD' },
    ])

    expect(held(positions, 'i-1')).toMatchObject({ quantity: 10, cost: 1000, dividends: 0, realised: 0 })
  })

  // An instrument named only by rows the engine ignores is not a holding, and
  // an empty position would list it among the portfolio anyway.
  it('creates no position for an instrument named only by interest or adjustment rows', () => {
    const positions = computePositions([
      interest('2024-03-31', 4, 'i-1'),
      { instrumentId: 'i-2', kind: 'adjustment', date: '2024-04-01', quantity: 3, amount: 99, currency: 'USD' },
    ])

    expect(positions.size).toBe(0)
  })

  it('creates no position for a trade with no instrument at all', () => {
    const positions = computePositions([
      { kind: 'interest', date: '2024-03-31', quantity: 0, amount: 4, currency: 'EUR' },
      fee('2024-06-30', 30.5),
    ])

    expect(positions.size).toBe(0)
  })

  it('reaches the same answer however the statement is ordered', () => {
    const trades = [
      buy('i-1', '2024-01-10', 10, 1000),
      dividend('i-1', '2024-02-10', 12),
      buy('i-1', '2024-02-10', 10, 2000),
      sell('i-1', '2024-03-10', 5, 1000),
    ]

    const chronological = computePositions(trades)
    const newestFirst = computePositions([...trades].reverse())

    expect(newestFirst).toEqual(chronological)
  })

  it('leaves the array the caller passed in untouched', () => {
    const trades = [buy('i-1', '2024-03-10', 1, 100), buy('i-1', '2024-01-10', 1, 100)]

    computePositions(trades)

    expect(trades[0].date).toBe('2024-03-10')
  })

  // A sale stamped with the same instant as the fill that funded it must not
  // read as selling what is not yet held.
  it('settles a buy before a sale recorded at the same instant', () => {
    const positions = computePositions([
      sell('i-1', '2023-07-10T13:37:53.778Z', 4, 500),
      buy('i-1', '2023-07-10T13:37:53.778Z', 4, 400),
    ])

    expect(held(positions, 'i-1').oversold).toBe(false)
    expect(held(positions, 'i-1').realised).toBeCloseTo(100, 8)
    expect(held(positions, 'i-1').quantity).toBe(0)
  })

  // 279.92947133 + 201.32754514 is 481.25701647 plus 5.7e-14 of binary
  // residue, so an exit that only subtracted would leave a position holding
  // nothing at a cost of nothing and still call itself open.
  it('closes an exit whose fills do not sum cleanly in binary', () => {
    const positions = computePositions([
      buy('i-1', '2024-01-10', 279.92947133, 1000),
      buy('i-1', '2024-02-10', 201.32754514, 720),
      sell('i-1', '2024-03-10', 481.25701647, 1900),
    ])

    expect(held(positions, 'i-1').quantity).toBe(0)
    expect(held(positions, 'i-1').cost).toBe(0)
    expect(held(positions, 'i-1').isClosed).toBe(true)
    expect(held(positions, 'i-1').realised).toBeCloseTo(180, 2)
  })

  // The same residue in the other direction: the statement's sale quantity is
  // a hair larger than the fills it liquidates, which is not an oversell.
  it('does not read binary residue as selling more than is held', () => {
    const positions = computePositions([
      buy('i-1', '2024-01-10', 129.24553568, 500),
      buy('i-1', '2024-02-10', 271.91853702, 1100),
      sell('i-1', '2024-03-10', 401.1640727, 1750),
    ])

    expect(held(positions, 'i-1').oversold).toBe(false)
    expect(held(positions, 'i-1').quantity).toBe(0)
    expect(held(positions, 'i-1').isClosed).toBe(true)
    expect(held(positions, 'i-1').realised).toBeCloseTo(150, 2)
  })

  it('keeps a fractional remainder that is a real holding', () => {
    const positions = computePositions([
      buy('i-1', '2024-01-10', 468.09345794, 1000),
      buy('i-1', '2024-02-10', 0.03009419, 0.07),
      sell('i-1', '2024-03-10', 468.09345794, 1100),
    ])

    expect(held(positions, 'i-1').quantity).toBeCloseTo(0.03009419, 10)
    expect(held(positions, 'i-1').isClosed).toBe(false)
    expect(held(positions, 'i-1').cost).toBeGreaterThan(0)
  })

  // A statement downloaded from halfway through an account's life shows the
  // sale but not the buy that preceded it.
  it('clamps a sale larger than the holding instead of going negative', () => {
    const positions = computePositions([
      buy('i-1', '2024-01-10', 4, 400),
      sell('i-1', '2024-03-10', 10, 1200),
    ])

    expect(held(positions, 'i-1').quantity).toBe(0)
    expect(held(positions, 'i-1').cost).toBe(0)
    expect(held(positions, 'i-1').oversold).toBe(true)
    expect(held(positions, 'i-1').isClosed).toBe(true)
  })

  it('handles a sale of something that was never bought', () => {
    const positions = computePositions([sell('i-1', '2024-03-10', 10, 1200)])

    expect(held(positions, 'i-1').quantity).toBe(0)
    expect(held(positions, 'i-1').oversold).toBe(true)
    expect(held(positions, 'i-1').realised).toBe(1200)
  })

  it('leaves an ordinary history unflagged', () => {
    const positions = computePositions([
      buy('i-1', '2024-01-10', 10, 1000),
      sell('i-1', '2024-03-10', 10, 1400),
    ])

    expect(held(positions, 'i-1').oversold).toBe(false)
  })

  it('keeps every instrument\u2019s figures to itself', () => {
    const positions = computePositions([
      buy('i-1', '2024-01-10', 10, 1000),
      buy('i-2', '2024-01-11', 5, 250, 'EUR'),
      dividend('i-2', '2024-02-11', 9, 'EUR'),
    ])

    expect(positions.size).toBe(2)
    expect(held(positions, 'i-1').dividends).toBe(0)
    expect(held(positions, 'i-2')).toMatchObject({ quantity: 5, cost: 250, dividends: 9, currency: 'EUR' })
  })

  // A custody fee billed in the account's currency before the export window's
  // first buy. Taking the position's currency from it would convert a USD cost
  // and a USD close as though they were euros, and nothing would say so.
  it('takes the currency from the earliest trade, not from whichever row comes first', () => {
    const positions = computePositions([
      fee('2024-01-01', 5, 'i-1', 'EUR'),
      buy('i-1', '2024-01-10', 10, 1000, 'USD'),
      buy('i-1', '2024-02-10', 5, 600, 'USD'),
    ])

    expect(held(positions, 'i-1').currency).toBe('USD')
    expect(held(positions, 'i-1').cost).toBe(1600)
  })

  it('falls back to the first row for an instrument with no trade at all', () => {
    const positions = computePositions([dividend('i-1', '2024-02-10', 12, 'EUR')])

    expect(held(positions, 'i-1').currency).toBe('EUR')
    expect(held(positions, 'i-1').dividends).toBe(12)
  })

  // 100 dollars added to a pile of euros makes a number in no currency at all,
  // and the summary would go on to convert the whole pile at the euro rate.
  it('keeps a dividend paid in another currency out of the position’s income', () => {
    const positions = computePositions([
      buy('i-1', '2024-01-10', 10, 1000, 'EUR'),
      dividend('i-1', '2024-02-10', 20, 'EUR'),
      dividend('i-1', '2024-03-10', 100, 'USD'),
    ])

    expect(held(positions, 'i-1').dividends).toBe(20)
  })

  it('leaves the mismatched row where it can still be seen', () => {
    const foreign = dividend('i-1', '2024-03-10', 100, 'USD')
    const positions = computePositions([buy('i-1', '2024-01-10', 10, 1000, 'EUR'), foreign])

    expect(held(positions, 'i-1').excluded).toEqual([{ trade: foreign, reason: 'foreign-currency' }])
  })

  it('keeps a fee charged in another currency out of the position’s fees', () => {
    const foreign = fee('2024-01-01', 5, 'i-1', 'EUR')
    const positions = computePositions([foreign, buy('i-1', '2024-01-10', 10, 1000, 'USD')])

    expect(held(positions, 'i-1').fees).toBe(0)
    expect(held(positions, 'i-1').excluded).toEqual([{ trade: foreign, reason: 'foreign-currency' }])
  })

  // `quantity` defaults to 0 on the schema, so a hand-entered trade or a row
  // whose quantity the parser could not read arrives as a buy of nothing for
  // real money. Reporting it as an ordinary closed holding would say the 1000
  // never left the account.
  it('keeps the cost of a buy whose quantity the statement never gave', () => {
    const positions = computePositions([buy('i-1', '2024-01-10', 0, 1000)])

    expect(held(positions, 'i-1')).toMatchObject({
      quantity: 0,
      cost: 1000,
      averageCost: 0,
      unquantified: true,
    })
  })

  // The same lost quantity, but posted after the holding had already been
  // exited. Deciding on the strength of "this instrument was sold at some
  // point" that the basis must be gone destroys the 500 all over again.
  it('keeps the cost of an unquantified buy made after a full exit', () => {
    const positions = computePositions([
      buy('i-1', '2024-01-10', 10, 1000),
      sell('i-1', '2024-03-10', 10, 1400),
      buy('i-1', '2024-05-10', 0, 500),
    ])

    expect(held(positions, 'i-1')).toMatchObject({
      quantity: 0,
      cost: 500,
      averageCost: 0,
      unquantified: true,
    })
    expect(held(positions, 'i-1').realised).toBeCloseTo(400, 8)
  })

  // The exit still releases a basis that an unquantified buy contributed to,
  // so the money is accounted for by the sale rather than left standing.
  it('releases an unquantified buy’s basis when a later sale empties the holding', () => {
    const positions = computePositions([
      buy('i-1', '2024-01-10', 0, 500),
      buy('i-1', '2024-02-10', 10, 1000),
      sell('i-1', '2024-03-10', 10, 1400),
    ])

    expect(held(positions, 'i-1').cost).toBe(0)
    expect(held(positions, 'i-1').unquantified).toBe(false)
    expect(held(positions, 'i-1').realised).toBeCloseTo(-100, 8)
  })

  it('still clears the basis of a holding that was sold down to nothing', () => {
    const positions = computePositions([
      buy('i-1', '2024-01-10', 10, 1000),
      sell('i-1', '2024-03-10', 10, 1400),
    ])

    expect(held(positions, 'i-1').cost).toBe(0)
    expect(held(positions, 'i-1').unquantified).toBe(false)
  })

  it('leaves a position that only ever received dividends unflagged', () => {
    const positions = computePositions([dividend('i-1', '2024-02-10', 12)])

    expect(held(positions, 'i-1').unquantified).toBe(false)
  })

  // An unreadable date makes the comparator's difference NaN, which is falsy:
  // the comparison used to fall through to the buy-before-sell rank and stop
  // being transitive, and a sort handed a non-transitive comparator may order
  // the readable rows around it however it likes. This history came out five
  // different ways - three of them reading as an oversell - depending only on
  // where in the export the undated row sat.
  it('reaches the same answer wherever an unreadable date sits in the input', () => {
    const rows = [
      buy('i-1', '2024-01-10', 10, 1000),
      buy('i-1', '2024-02-10', 5, 600),
      sell('i-1', '2024-03-10', 12, 1500),
      buy('i-1', '2024-04-10', 2, 300),
      buy('i-1', 'not a date', 5, 500),
    ]
    const chronological = held(computePositions(rows), 'i-1')

    expect(chronological).toMatchObject({ quantity: 5, oversold: false })
    expect(chronological.cost).toBeCloseTo(620, 8)
    expect(chronological.realised).toBeCloseTo(220, 8)

    for (const ordering of permutations(rows)) {
      expect(held(computePositions(ordering), 'i-1')).toEqual(chronological)
    }
  })

  it('sets an unreadably dated row aside instead of counting it', () => {
    const undated = buy('i-1', 'not a date', 5, 500)
    const positions = computePositions([buy('i-1', '2024-01-10', 10, 1000), undated])

    expect(held(positions, 'i-1').quantity).toBe(10)
    expect(held(positions, 'i-1').cost).toBe(1000)
    expect(held(positions, 'i-1').excluded).toEqual([{ trade: undated, reason: 'unreadable-date' }])
  })
})

describe('quantityHeldOn', () => {
  const trades = [
    buy('i-1', '2024-01-10T13:00:00Z', 10, 1000),
    buy('i-1', '2024-02-10T09:30:00Z', 5, 600),
    sell('i-1', '2024-03-10T15:45:00Z', 15, 1800),
    dividend('i-1', '2024-02-20T00:00:00Z', 40),
    fee('2024-02-20T00:00:00Z', 2.5, 'i-1'),
  ]

  it('is zero before the first buy', () => {
    expect(quantityHeldOn(trades, 'i-1', new UTCDate('2024-01-09'))).toBe(0)
  })

  it('counts a trade made on the day asked about', () => {
    expect(quantityHeldOn(trades, 'i-1', new UTCDate('2024-01-10'))).toBe(10)
  })

  it('holds the quantity steady between trades', () => {
    expect(quantityHeldOn(trades, 'i-1', new UTCDate('2024-01-31'))).toBe(10)
    expect(quantityHeldOn(trades, 'i-1', new UTCDate('2024-02-29'))).toBe(15)
  })

  it('is zero after a full exit, and stays zero', () => {
    expect(quantityHeldOn(trades, 'i-1', new UTCDate('2024-03-10'))).toBe(0)
    expect(quantityHeldOn(trades, 'i-1', new UTCDate('2027-01-01'))).toBe(0)
  })

  it('is zero for an instrument that was never traded', () => {
    expect(quantityHeldOn(trades, 'i-unknown', new UTCDate('2024-02-01'))).toBe(0)
  })

  it('is unmoved by dividends and fees', () => {
    expect(quantityHeldOn(trades, 'i-1', new UTCDate('2024-02-20'))).toBe(15)
  })

  it('takes the closing quantity when a day holds several fills', () => {
    const sameDay = [
      buy('i-1', '2024-01-10T09:00:00Z', 2, 200),
      buy('i-1', '2024-01-10T09:05:00Z', 5, 500),
      buy('i-1', '2024-01-10T16:00:00Z', 26, 2600),
    ]

    expect(quantityHeldOn(sameDay, 'i-1', new UTCDate('2024-01-10'))).toBe(33)
  })

  it('reads the same however the statement is ordered', () => {
    const newestFirst = [...trades].reverse()

    expect(quantityHeldOn(newestFirst, 'i-1', new UTCDate('2024-02-15'))).toBe(15)
  })

  it('clamps an oversell to zero rather than going negative', () => {
    const short = [buy('i-1', '2024-01-10', 4, 400), sell('i-1', '2024-03-10', 10, 1200)]

    expect(quantityHeldOn(short, 'i-1', new UTCDate('2024-03-10'))).toBe(0)
  })

  it('keeps a fractional holding exact and lands on zero at the exit', () => {
    const fractional = [
      buy('i-1', '2024-01-10', 129.24553568, 500),
      buy('i-1', '2024-02-10', 271.91853702, 1100),
      sell('i-1', '2024-03-10', 401.1640727, 1750),
    ]

    expect(quantityHeldOn(fractional, 'i-1', new UTCDate('2024-01-15'))).toBe(129.24553568)
    expect(quantityHeldOn(fractional, 'i-1', new UTCDate('2024-02-15'))).toBeCloseTo(401.1640727, 10)
    // Not 5.7e-14 of a share.
    expect(quantityHeldOn(fractional, 'i-1', new UTCDate('2024-03-15'))).toBe(0)
  })

  // The residue the other way round: the fills sum to a hair MORE than the
  // sale, so subtracting leaves 5.7e-14 on the timeline unless it is snapped.
  it('lands on zero when the fills overshoot the sale by float residue', () => {
    const fractional = [
      buy('i-1', '2024-01-10', 279.92947133, 1000),
      buy('i-1', '2024-02-10', 201.32754514, 720),
      sell('i-1', '2024-03-10', 481.25701647, 1900),
    ]

    expect(quantityHeldOn(fractional, 'i-1', new UTCDate('2024-03-15'))).toBe(0)
  })

  // Days are UTC calendar days, matching the exchange-rate and price caches, so
  // a fill late in the UTC evening belongs to that UTC day and not the next one
  // the reader's clock happens to be in.
  it('buckets a trade by its UTC day rather than the machine one', () => {
    const lateInTheDay = [buy('i-1', '2024-01-10T23:30:00Z', 10, 1000)]

    expect(quantityHeldOn(lateInTheDay, 'i-1', new UTCDate('2024-01-09'))).toBe(0)
    expect(quantityHeldOn(lateInTheDay, 'i-1', new UTCDate('2024-01-10'))).toBe(10)

    const earlyInTheDay = [buy('i-1', '2024-01-10T00:30:00Z', 10, 1000)]

    expect(quantityHeldOn(earlyInTheDay, 'i-1', new UTCDate('2024-01-09'))).toBe(0)
    expect(quantityHeldOn(earlyInTheDay, 'i-1', new UTCDate('2024-01-10'))).toBe(10)
  })

  // An unreadable date has no place on a list the search assumes is sorted: one
  // NaN in it and every answer after it is whatever the comparison happened to
  // return.
  it('still answers correctly when a row carries an unreadable date', () => {
    const withRubbish = [
      buy('i-1', '2024-01-10', 10, 1000),
      buy('i-1', 'not a date', 5, 500),
      sell('i-1', '2024-03-10', 4, 500),
    ]

    expect(quantityHeldOn(withRubbish, 'i-1', new UTCDate('2024-01-05'))).toBe(0)
    expect(quantityHeldOn(withRubbish, 'i-1', new UTCDate('2024-02-01'))).toBe(10)
    expect(quantityHeldOn(withRubbish, 'i-1', new UTCDate('2024-04-01'))).toBe(6)
  })

  it('agrees with the final position after the last trade', () => {
    const open = [buy('i-1', '2024-01-10', 10, 1000), sell('i-1', '2024-03-10', 4, 500)]

    expect(quantityHeldOn(open, 'i-1', new UTCDate('2024-04-01'))).toBe(
      computePositions(open).get('i-1')?.quantity
    )
  })

  // The timeline drops a row it cannot place in time; the position has to drop
  // the same one, or the holding on the chart and the holding in the list are
  // two different numbers.
  it('agrees with the final position when a row carries an unreadable date', () => {
    const withRubbish = [buy('i-1', '2024-01-10', 10, 1000), buy('i-1', 'not a date', 5, 500)]

    expect(quantityHeldOn(withRubbish, 'i-1', new UTCDate('2024-04-01'))).toBe(
      computePositions(withRubbish).get('i-1')?.quantity
    )
    expect(quantityHeldOn(withRubbish, 'i-1', new UTCDate('2024-04-01'))).toBe(10)
  })

  // And the same for a row the position refuses because it settles in another
  // currency.
  it('agrees with the final position when a buy settles in another currency', () => {
    const mixed = [buy('i-1', '2024-01-10', 10, 1000, 'USD'), buy('i-1', '2024-02-10', 5, 450, 'EUR')]

    expect(quantityHeldOn(mixed, 'i-1', new UTCDate('2024-04-01'))).toBe(
      computePositions(mixed).get('i-1')?.quantity
    )
    expect(quantityHeldOn(mixed, 'i-1', new UTCDate('2024-04-01'))).toBe(10)
  })
})

describe('createQuantityLookup', () => {
  it('answers for every instrument from one prepared timeline', () => {
    const lookup = createQuantityLookup([
      buy('i-1', '2024-01-10', 10, 1000),
      buy('i-2', '2024-02-10', 3, 300),
      sell('i-1', '2024-03-10', 4, 500),
    ])

    expect(lookup('i-1', new UTCDate('2024-01-15'))).toBe(10)
    expect(lookup('i-2', new UTCDate('2024-01-15'))).toBe(0)
    expect(lookup('i-2', new UTCDate('2024-02-15'))).toBe(3)
    expect(lookup('i-1', new UTCDate('2024-03-15'))).toBe(6)
  })

  it('reads every day of a range the way the one-shot helper does', () => {
    const trades = [
      buy('i-1', '2024-01-10', 10, 1000),
      buy('i-1', '2024-01-12', 5, 600),
      sell('i-1', '2024-01-14', 15, 1800),
    ]
    const lookup = createQuantityLookup(trades)

    const days = Array.from({ length: 8 }, (_, index) => new UTCDate(2024, 0, 8 + index))

    expect(days.map((day) => lookup('i-1', day))).toEqual(days.map((day) => quantityHeldOn(trades, 'i-1', day)))
    expect(days.map((day) => lookup('i-1', day))).toEqual([0, 0, 10, 10, 15, 15, 0, 0])
  })

  it('answers zero for every day when there are no trades', () => {
    const lookup = createQuantityLookup([])

    expect(lookup('i-1', new UTCDate('2024-01-10'))).toBe(0)
  })
})

describe('order independence', () => {
  it('reads a history the same way whichever end the broker exported from', () => {
    // DeGiro exports newest-first and Revolut oldest-first, and two rows nobody
    // can place in time tie in the comparator - so a stable sort leaves them in
    // file order and the same history would otherwise produce two answers.
    const trades = [
      buy('i-1', '2024-01-10', 10, 1000, 'EUR'),
      buy('i-1', 'not a date', 5, 500, 'EUR'),
      buy('i-1', 'also not a date', 7, 700, 'EUR'),
    ]

    expect(computePositions([...trades].reverse())).toEqual(computePositions(trades))
  })
})

describe('summarizePortfolio', () => {
  it('withholds the basis of a holding whose shares were never counted', () => {
    // tradeSchema defaults quantity to 0, so a row the parser could not read
    // arrives as cash paid for no shares. The position is closed, which used to
    // make its value a confident zero and turn the whole basis into a reported
    // loss - a parse failure shown to the user as losing every euro of it.
    const summary = summarizePortfolio(computePositions([buy('i-1', '2024-01-10', 0, 1000, 'EUR')]), () => 150, convert)

    expect(summary.cost).toBe(0)
    expect(summary.marketValue).toBe(0)
    expect(summary.unrealised).toBe(0)
    expect(summary.totalReturn).toBe(0)
    expect(summary.unquantified).toEqual(['i-1'])
  })

  it('still counts the dividends of a holding whose shares were never counted', () => {
    const summary = summarizePortfolio(
      computePositions([buy('i-1', '2024-01-10', 0, 1000, 'EUR'), dividend('i-1', '2024-03-01', 40, 'EUR')]),
      () => 150,
      convert
    )

    expect(summary.dividends).toBe(40)
    expect(summary.totalReturn).toBe(40)
    expect(summary.unquantified).toEqual(['i-1'])
  })

  it('values an open position at its last close', () => {
    const summary = summarizePortfolio(
      positionMap(position({ instrumentId: 'i-1', quantity: 10, cost: 1000, averageCost: 100 })),
      () => 150,
      convert
    )

    expect(summary).toEqual({
      cost: 1000,
      marketValue: 1500,
      unrealised: 500,
      realised: 0,
      dividends: 0,
      totalReturn: 500,
      missingPrices: [],
      missingCurrencies: [],
      unquantified: [],
    })
  })

  // Price appreciation alone would report this holding as flat, when it has in
  // fact returned every euro it paid out.
  it('counts realised gain and dividends into the total return', () => {
    const summary = summarizePortfolio(
      positionMap(position({ instrumentId: 'i-1', quantity: 10, cost: 1000, dividends: 80, realised: 120 })),
      () => 100,
      convert
    )

    expect(summary.unrealised).toBe(0)
    expect(summary.totalReturn).toBe(200)
  })

  it('converts each position out of its own currency', () => {
    const summary = summarizePortfolio(
      positionMap(
        position({ instrumentId: 'i-1', quantity: 10, cost: 1000, currency: 'EUR' }),
        position({ instrumentId: 'i-2', quantity: 10, cost: 1000, dividends: 40, currency: 'USD' })
      ),
      () => 120,
      convert
    )

    expect(summary.cost).toBe(1500)
    expect(summary.marketValue).toBe(1800)
    expect(summary.dividends).toBe(20)
    expect(summary.missingPrices).toEqual([])
  })

  it('values a closed position at zero without asking for a price', () => {
    const summary = summarizePortfolio(
      positionMap(position({ instrumentId: 'i-1', isClosed: true, realised: 300, dividends: 50 })),
      noPrices,
      convert
    )

    expect(summary.marketValue).toBe(0)
    expect(summary.totalReturn).toBe(350)
    expect(summary.missingPrices).toEqual([])
  })

  // Naming the shortfall is what lets the UI call the figure partial instead of
  // presenting an understated one as the whole picture.
  it('names an instrument with no close and leaves its value and its basis out', () => {
    const summary = summarizePortfolio(
      positionMap(
        position({ instrumentId: 'i-1', quantity: 10, cost: 1000 }),
        position({ instrumentId: 'i-2', quantity: 5, cost: 900, realised: 40, dividends: 10 })
      ),
      (instrumentId) => (instrumentId === 'i-1' ? 150 : null),
      convert
    )

    expect(summary.cost).toBe(1000)
    expect(summary.marketValue).toBe(1500)
    // Both halves of the unpriced position go, so this stays the gap between
    // two figures that belong together rather than 1500 - 1900.
    expect(summary.unrealised).toBe(500)
    expect(summary.missingPrices).toEqual(['i-2'])
  })

  // Money already received is known in the position's own currency, with no
  // close involved. A fresh install or an hour of provider downtime must not
  // make the app state a dividend of 0.00 as fact.
  it('still counts the realised gain and the dividends of an instrument it cannot price', () => {
    const summary = summarizePortfolio(
      positionMap(position({ instrumentId: 'i-1', quantity: 10, cost: 1000, realised: 500, dividends: 300 })),
      noPrices,
      convert
    )

    expect(summary).toEqual({
      cost: 0,
      marketValue: 0,
      unrealised: 0,
      realised: 500,
      dividends: 300,
      totalReturn: 800,
      missingPrices: ['i-1'],
      missingCurrencies: [],
      unquantified: [],
    })
  })

  // Nothing held in a currency with no rate can be stated in the base one, not
  // even the cash it has already paid out.
  it('names a currency with no rate and drops even the cash held in it', () => {
    const summary = summarizePortfolio(
      positionMap(
        position({ instrumentId: 'i-1', quantity: 10, cost: 1000 }),
        position({ instrumentId: 'i-2', quantity: 5, cost: 900, realised: 40, dividends: 10, currency: 'GBP' })
      ),
      () => 150,
      convert
    )

    expect(summary.cost).toBe(1000)
    expect(summary.realised).toBe(0)
    expect(summary.dividends).toBe(0)
    expect(summary.missingPrices).toEqual([])
    expect(summary.missingCurrencies).toEqual(['GBP'])
  })

  it('names each currency it has no rate for once, sorted', () => {
    const summary = summarizePortfolio(
      positionMap(
        position({ instrumentId: 'i-1', quantity: 1, cost: 10, currency: 'SEK' }),
        position({ instrumentId: 'i-2', quantity: 1, cost: 10, currency: 'GBP' }),
        position({ instrumentId: 'i-3', quantity: 1, cost: 10, currency: 'GBP' })
      ),
      () => 150,
      convert
    )

    expect(summary.missingCurrencies).toEqual(['GBP', 'SEK'])
  })

  it('sorts the instruments it could not value', () => {
    const summary = summarizePortfolio(
      positionMap(
        position({ instrumentId: 'i-9', quantity: 1, cost: 10 }),
        position({ instrumentId: 'i-3', quantity: 1, cost: 10 })
      ),
      noPrices,
      convert
    )

    expect(summary.missingPrices).toEqual(['i-3', 'i-9'])
  })

  it('reports zeroes for an empty portfolio', () => {
    const summary = summarizePortfolio(new Map(), noPrices, convert)

    expect(summary).toEqual({
      cost: 0,
      marketValue: 0,
      unrealised: 0,
      realised: 0,
      dividends: 0,
      totalReturn: 0,
      missingPrices: [],
      missingCurrencies: [],
      unquantified: [],
    })
  })

  it('reports a position under water as a negative unrealised figure', () => {
    const summary = summarizePortfolio(
      positionMap(position({ instrumentId: 'i-1', quantity: 10, cost: 1000 })),
      () => 60,
      convert
    )

    expect(summary.unrealised).toBe(-400)
    expect(summary.totalReturn).toBe(-400)
  })

  // A price cache holding a malformed row hands back Number(record.close),
  // which is NaN - and NaN is not null, so a missing close that arrives this
  // way used to spread through every headline figure unannounced.
  it.each([
    ['NaN', NaN],
    ['undefined', undefined],
    ['Infinity', Infinity],
  ])('treats a %s close as no close at all', (_label, price) => {
    const summary = summarizePortfolio(
      positionMap(position({ instrumentId: 'i-1', quantity: 10, cost: 1000, realised: 500, dividends: 300 })),
      (() => price) as PriceLookup,
      convert
    )

    expect(summary).toEqual({
      cost: 0,
      marketValue: 0,
      unrealised: 0,
      realised: 500,
      dividends: 300,
      totalReturn: 800,
      missingPrices: ['i-1'],
      missingCurrencies: [],
      unquantified: [],
    })
  })

  it('treats a conversion that comes back non-finite as no rate at all', () => {
    const brokenRate: Converter = (amount, currency) => (currency === 'EUR' ? amount : amount * NaN)

    const summary = summarizePortfolio(
      positionMap(
        position({ instrumentId: 'i-1', quantity: 10, cost: 1000 }),
        position({ instrumentId: 'i-2', quantity: 5, cost: 900, dividends: 10, currency: 'USD' })
      ),
      () => 150,
      brokenRate
    )

    expect(summary.marketValue).toBe(1500)
    expect(summary.cost).toBe(1000)
    expect(summary.dividends).toBe(0)
    expect(summary.totalReturn).toBe(500)
    expect(summary.missingCurrencies).toEqual(['USD'])
  })
})

// The two anonymised statements in src/lib/import/__fixtures__ are the shape
// the engine actually has to survive; every figure below comes from the
// constants recomputed from those files.
describe('the fixture statements', () => {
  const [iShares, invesco] = expectedDegiroPositions
  const [smallFill, largeFill] = expectedDegiroPartialFillQuantities

  interface DegiroBuyRow {
    date: string
    quantity: number
    amount: number
    /** The order's commission, on the row that carries it; 0 on the others. */
    commission: number
  }

  // Every buy row the DeGiro fixture holds, with its own date, quantity and
  // cash amount rather than a reconstruction that only adds up to the same
  // total - a number that is not in the file cannot catch the engine getting
  // the file wrong.
  const iSharesBuys: DegiroBuyRow[] = [
    { date: '2023-06-19T12:32:00Z', quantity: 2, amount: 1025.00, commission: 1.00 },
    { date: '2023-06-21T11:10:00Z', quantity: 17, amount: 8758.40, commission: 1.00 },
    // One order, two partial fills at 604 EUR sharing a single commission.
    { date: '2024-01-17T16:31:00Z', quantity: largeFill, amount: largeFill * 604, commission: 1.00 },
    { date: '2024-01-17T16:31:00Z', quantity: smallFill, amount: smallFill * 604, commission: 0 },
    { date: '2024-03-11T10:16:00Z', quantity: 4, amount: 2245.00, commission: 1.00 },
    { date: '2025-01-29T11:58:00Z', quantity: 3, amount: 1921.50, commission: 3.00 },
  ]

  const invescoBuys: DegiroBuyRow[] = [
    // The thousands separator inside the description is what makes this row
    // 1540 shares rather than 1.
    { date: '2023-07-06T16:57:00Z', quantity: expectedDegiroLargestBuyQuantity, amount: 9933.00, commission: 3.00 },
    { date: '2024-01-18T09:04:00Z', quantity: 251, amount: 1606.40, commission: 3.00 },
    { date: '2024-02-28T09:08:00Z', quantity: 322, amount: 2189.60, commission: 3.00 },
    { date: '2024-03-11T10:18:00Z', quantity: 72, amount: 459.00, commission: 3.00 },
    { date: '2024-12-31T10:35:00Z', quantity: 226, amount: 1695.00, commission: 3.00 },
    { date: '2025-01-29T12:09:00Z', quantity: 58, amount: 437.61, commission: 3.00 },
    { date: '2025-07-21T15:43:00Z', quantity: 198, amount: 1692.90, commission: 3.00 },
  ]

  function degiroRows(instrumentId: string, rows: DegiroBuyRow[]): PositionTrade[] {
    return rows.flatMap((row) => [
      buy(instrumentId, row.date, row.quantity, row.amount, 'EUR'),
      ...(row.commission ? [fee(row.date, row.commission, instrumentId, 'EUR')] : []),
    ])
  }

  function commissionsOf(rows: DegiroBuyRow[]): number {
    return rows.reduce((total, row) => total + row.commission, 0)
  }

  // The annual exchange connection fee is charged to the account, not to a
  // holding, so it must stay out of every position's fees.
  const degiroAccountFeeDates = ['2023-06-27T16:25:00Z', '2024-02-01T17:13:00Z', '2025-02-17T10:44:00Z']
  const degiroAccountFeeTotal = degiroAccountFeeDates.length * 2.5

  const degiroTrades: PositionTrade[] = [
    ...degiroRows('degiro-ishares', iSharesBuys),
    ...degiroRows('degiro-invesco', invescoBuys),
    ...degiroAccountFeeDates.map((date) => fee(date, 2.5, undefined, 'EUR')),
    // Every interest posting in this statement is a zero-amount notice.
    interest('2023-07-01T23:00:00Z', 0, undefined, 'EUR'),
  ]

  const [abev] = expectedRevolutPositions
  const spgiFills = [
    { date: '2021-12-21T14:30:56Z', quantity: 0.07141837, amount: 25 },
    { date: '2022-09-28T18:14:46Z', quantity: 0.1080789, amount: 40 },
  ]
  const spgiDividends = [
    { date: '2022-03-07T04:41:35Z', amount: 0.05 },
    { date: '2022-06-07T04:35:52Z', amount: 0.05 },
    { date: '2022-09-07T09:35:27Z', amount: 0.04 },
    { date: '2022-12-07T10:07:21Z', amount: 0.08 },
    { date: '2023-03-08T09:38:47Z', amount: 0.08 },
    { date: '2023-06-08T07:36:04Z', amount: 0.08 },
  ]
  const abevDividends = [
    { date: '2024-01-05T10:54:57Z', amount: 18.40 },
    { date: '2024-01-16T12:22:24Z', amount: 35.60 },
    { date: '2024-04-09T10:23:24Z', amount: 12.75 },
    { date: '2024-07-12T07:52:51Z', amount: 13.20 },
    { date: '2024-10-08T14:30:53Z', amount: 13.45 },
    { date: '2025-01-03T17:13:10Z', amount: 42.30 },
    { date: '2025-04-10T15:43:46Z', amount: 6.90 },
    { date: '2025-07-07T15:53:32Z', amount: 6.90 },
  ]

  const revolutTrades: PositionTrade[] = [
    ...spgiFills.map((fill) => buy('revolut-spgi', fill.date, fill.quantity, fill.amount)),
    ...spgiDividends.map((paid) => dividend('revolut-spgi', paid.date, paid.amount)),
    sell(
      'revolut-spgi',
      '2023-07-10T13:37:53Z',
      spgiFills[0].quantity + spgiFills[1].quantity,
      expectedRevolutSaleProceeds
    ),
    buy('revolut-abev', '2023-07-10T13:38:31Z', abev.quantity, abev.cost),
    ...abevDividends.map((paid) => dividend('revolut-abev', paid.date, paid.amount)),
  ]

  // The reconstruction above is only worth trusting if it is the statement's
  // own row counts, so the totals it feeds the engine are the file's.
  it('feeds the engine as many rows as the DeGiro statement holds', () => {
    expect(degiroTrades.filter((trade) => trade.kind === 'buy')).toHaveLength(expectedDegiroRowCounts.buy)
    expect(degiroTrades.filter((trade) => trade.kind === 'fee')).toHaveLength(expectedDegiroRowCounts.fee)
    expect(commissionsOf(iSharesBuys) + commissionsOf(invescoBuys) + degiroAccountFeeTotal)
      .toBeCloseTo(expectedDegiroFeeTotal, 2)
  })

  it('rebuilds the DeGiro holdings from their partial fills', () => {
    const positions = computePositions(degiroTrades)

    expect(positions.size).toBe(expectedDegiroInstrumentCount)
    expect(held(positions, 'degiro-ishares').quantity).toBe(iShares.quantity)
    expect(held(positions, 'degiro-ishares').cost).toBeCloseTo(iShares.cost, 2)
    expect(held(positions, 'degiro-ishares').currency).toBe(iShares.currency)
    expect(held(positions, 'degiro-invesco').quantity).toBe(invesco.quantity)
    expect(held(positions, 'degiro-invesco').cost).toBeCloseTo(invesco.cost, 2)
  })

  it('has nothing realised and nothing distributed on the DeGiro side', () => {
    const positions = computePositions(degiroTrades)

    for (const entry of positions.values()) {
      expect(entry.realised).toBe(expectedDegiroRealisedGain)
      expect(entry.dividends).toBe(expectedDegiroDividendTotal)
      expect(entry.isClosed).toBe(false)
    }
  })

  it('attributes the DeGiro commissions but not the annual account fee', () => {
    const positions = computePositions(degiroTrades)
    const attributed = [...positions.values()].reduce((total, entry) => total + entry.fees, 0)

    expect(held(positions, 'degiro-ishares').fees).toBeCloseTo(commissionsOf(iSharesBuys), 2)
    expect(held(positions, 'degiro-invesco').fees).toBeCloseTo(commissionsOf(invescoBuys), 2)
    expect(attributed + degiroAccountFeeTotal).toBeCloseTo(expectedDegiroFeeTotal, 2)
  })

  it('closes the Revolut holding that was sold in full and keeps its gain', () => {
    const positions = computePositions(revolutTrades)
    const spgi = held(positions, `revolut-${expectedRevolutClosedTickers[0].toLowerCase()}`)

    expect(spgi.quantity).toBe(0)
    expect(spgi.cost).toBe(0)
    expect(spgi.isClosed).toBe(true)
    expect(spgi.oversold).toBe(false)
    expect(spgi.realised).toBeCloseTo(expectedRevolutRealisedGain, 2)
    expect(expectedRevolutSaleProceeds - spgi.realised).toBeCloseTo(expectedRevolutSaleCostBasis, 2)
    expect(spgi.dividends).toBeCloseTo(expectedRevolutDividendTotals.SPGI, 2)
  })

  it('carries the fractional Revolut holding through exactly', () => {
    const positions = computePositions(revolutTrades)
    const abevPosition = held(positions, 'revolut-abev')

    expect(abevPosition.quantity).toBe(abev.quantity)
    expect(abevPosition.cost).toBeCloseTo(abev.cost, 2)
    expect(abevPosition.currency).toBe(abev.currency)
    expect(abevPosition.averageCost).toBeCloseTo(abev.cost / abev.quantity, 8)
    expect(abevPosition.isClosed).toBe(false)
    expect(abevPosition.dividends).toBeCloseTo(expectedRevolutDividendTotals.ABEV, 2)
  })

  it('adds the Revolut dividends up across open and closed holdings alike', () => {
    const positions = computePositions(revolutTrades)
    const total = [...positions.values()].reduce((sum, entry) => sum + entry.dividends, 0)

    expect(total).toBeCloseTo(expectedRevolutDividendTotal, 2)
  })

  it('reaches the same Revolut figures from a newest-first export', () => {
    expect(computePositions([...revolutTrades].reverse())).toEqual(computePositions(revolutTrades))
  })

  it('holds nothing of the sold Revolut stock the day after the sale', () => {
    expect(quantityHeldOn(revolutTrades, 'revolut-spgi', new UTCDate('2023-07-09'))).toBeCloseTo(0.17949727, 10)
    expect(quantityHeldOn(revolutTrades, 'revolut-spgi', new UTCDate('2023-07-10'))).toBe(0)
    expect(quantityHeldOn(revolutTrades, 'revolut-abev', new UTCDate('2023-07-10'))).toBe(abev.quantity)
  })

  it('reports the whole fixture portfolio in one base currency', () => {
    const positions = computePositions([...degiroTrades, ...revolutTrades])
    const prices: PriceLookup = (instrumentId) => (instrumentId === 'revolut-abev' ? 3 : 600)

    const summary = summarizePortfolio(positions, prices, convert)

    // ABEV is quoted in USD, which this converter halves.
    const abevValue = (abev.quantity * 3) / 2
    expect(summary.marketValue).toBeCloseTo(iShares.quantity * 600 + invesco.quantity * 600 + abevValue, 2)
    expect(summary.cost).toBeCloseTo(iShares.cost + invesco.cost + abev.cost / 2, 2)
    expect(summary.realised).toBeCloseTo(expectedRevolutRealisedGain / 2, 2)
    expect(summary.dividends).toBeCloseTo(expectedRevolutDividendTotal / 2, 2)
    expect(summary.missingPrices).toEqual([])
  })
})
