import { UTCDate } from '@date-fns/utc'
import { describe, it, expect } from 'vitest'
import {
  annualisedVolatility,
  axisTickLabel,
  buildPortfolioHistory,
  moneyWeightedReturn,
  windowProfit,
  windowRealised,
  xirr,
  downsample,
  rebasePerformance,
  sliceHistory,
  windowStart,
  zeroCrossing,
  type HistoryInputs,
  type HistoryPoint,
} from './portfolio-history'
import type { PositionTrade } from './positions'

function trade(overrides: Partial<PositionTrade> & { date: string }): PositionTrade {
  return {
    instrumentId: 'world',
    kind: 'buy',
    quantity: 0,
    amount: 0,
    currency: 'EUR',
    ...overrides,
  }
}

/** Closes as the market-data client hands them over: `symbol:YYYY-MM-DD`. */
function closesOf(entries: Record<string, Record<string, number>>): Map<string, number> {
  const closes = new Map<string, number>()
  for (const [symbol, days] of Object.entries(entries)) {
    for (const [date, close] of Object.entries(days)) {
      closes.set(`${symbol}:${date}`, close)
    }
  }
  return closes
}

const SYMBOLS: Record<string, string> = { world: 'IWDA.AS', us: 'VUSA.AS' }

function build(overrides: Partial<HistoryInputs> & Pick<HistoryInputs, 'trades' | 'from' | 'to'>) {
  return buildPortfolioHistory({
    symbolOf: instrumentId => SYMBOLS[instrumentId],
    quoteCurrencyOf: () => 'EUR',
    closes: new Map(),
    // One currency throughout unless a test says otherwise, so a figure is the
    // figure the engine computed rather than the product of an invented rate.
    convertOn: (amount, currency) => (currency === 'EUR' ? amount : null),
    ...overrides,
  })
}

const day = (date: string) => new UTCDate(`${date}T00:00:00.000Z`)

describe('buildPortfolioHistory', () => {
  it('values what was held on each day at that day\'s close', () => {
    const { points } = build({
      trades: [trade({ date: '2025-01-02T10:00:00.000Z', quantity: 10, amount: -1000 })],
      closes: closesOf({ 'IWDA.AS': { '2025-01-02': 100, '2025-01-03': 110, '2025-01-04': 105 } }),
      from: day('2025-01-02'),
      to: day('2025-01-04'),
    })

    expect(points.map(point => point.date)).toEqual(['2025-01-02', '2025-01-03', '2025-01-04'])
    expect(points.map(point => point.value)).toEqual([1000, 1100, 1050])
    expect(points.map(point => point.invested)).toEqual([1000, 1000, 1000])
    expect(points.map(point => point.gain)).toEqual([0, 100, 50])
  })

  // Exchanges are shut at weekends, and a curve that dropped to zero every
  // Saturday would read as a portfolio being sold and rebought each week.
  it('carries the last close forward over a day the market was shut', () => {
    const { points } = build({
      trades: [trade({ date: '2025-01-03T10:00:00.000Z', quantity: 10, amount: -1000 })],
      closes: closesOf({ 'IWDA.AS': { '2025-01-03': 100 } }),
      from: day('2025-01-03'),
      to: day('2025-01-05'),
    })

    expect(points.map(point => point.value)).toEqual([1000, 1000, 1000])
  })

  it('counts a second buy as more invested rather than as a gain', () => {
    const { points } = build({
      trades: [
        trade({ date: '2025-01-02T10:00:00.000Z', quantity: 10, amount: -1000 }),
        trade({ date: '2025-01-03T10:00:00.000Z', quantity: 10, amount: -1100 }),
      ],
      closes: closesOf({ 'IWDA.AS': { '2025-01-02': 100, '2025-01-03': 110 } }),
      from: day('2025-01-02'),
      to: day('2025-01-03'),
    })

    expect(points[1].value).toBe(2200)
    expect(points[1].invested).toBe(2100)
    expect(points[1].gain).toBeCloseTo(100, 10)
  })

  // The whole reason the curve is time-weighted: paying money in is not a
  // return, however much it moves the value.
  it('leaves the return untouched by the day money is paid in', () => {
    const { points } = build({
      trades: [
        trade({ date: '2025-01-02T10:00:00.000Z', quantity: 10, amount: -1000 }),
        trade({ date: '2025-01-03T10:00:00.000Z', quantity: 100, amount: -11000 }),
      ],
      closes: closesOf({ 'IWDA.AS': { '2025-01-02': 100, '2025-01-03': 110 } }),
      from: day('2025-01-02'),
      to: day('2025-01-03'),
    })

    // The price moved 100 -> 110 and ten times as much money arrived the same
    // day. The return is the price move alone.
    expect(points[1].performance).toBeCloseTo(0.1, 10)
    // ...where the plain ratio of value to cost would read as a loss.
    expect(points[1].gain / points[1].invested).toBeLessThan(0.01)
  })

  it('chains the daily returns rather than comparing the ends', () => {
    const { points } = build({
      trades: [trade({ date: '2025-01-02T10:00:00.000Z', quantity: 10, amount: -1000 })],
      closes: closesOf({
        'IWDA.AS': { '2025-01-02': 100, '2025-01-03': 110, '2025-01-04': 99 },
      }),
      from: day('2025-01-02'),
      to: day('2025-01-04'),
    })

    // +10% then -10% is -1%, not the 0% that adding the two would give.
    expect(points[2].performance).toBeCloseTo(-0.01, 10)
  })

  it('reads a dividend as return earned, not as value lost', () => {
    const { points } = build({
      trades: [
        trade({ date: '2025-01-02T10:00:00.000Z', quantity: 10, amount: -1000 }),
        trade({ date: '2025-01-03T10:00:00.000Z', kind: 'dividend', amount: 50 }),
      ],
      // The price drops by the dividend on the day it is paid, which is what
      // makes an income-blind curve report a loss.
      closes: closesOf({ 'IWDA.AS': { '2025-01-02': 100, '2025-01-03': 95 } }),
      from: day('2025-01-02'),
      to: day('2025-01-03'),
    })

    expect(points[1].value).toBe(950)
    expect(points[1].performance).toBeCloseTo(0, 10)
  })

  it('releases the basis of a holding that is sold, and keeps the return it made', () => {
    const { points } = build({
      trades: [
        trade({ date: '2025-01-02T10:00:00.000Z', quantity: 10, amount: -1000 }),
        trade({ date: '2025-01-03T10:00:00.000Z', kind: 'sell', quantity: 10, amount: 1100 }),
      ],
      closes: closesOf({ 'IWDA.AS': { '2025-01-02': 100, '2025-01-03': 110 } }),
      from: day('2025-01-02'),
      to: day('2025-01-04'),
    })

    expect(points[1].value).toBe(0)
    expect(points[1].invested).toBe(0)
    // Sold at a tenth more than it cost, and the sale is a withdrawal rather
    // than a loss of everything.
    expect(points[1].performance).toBeCloseTo(0.1, 10)
    // Nothing is held any more, so the return simply stops moving.
    expect(points[2].performance).toBeCloseTo(0.1, 10)
  })

  it('splits the basis of a holding that is only half sold', () => {
    const { points } = build({
      trades: [
        trade({ date: '2025-01-02T10:00:00.000Z', quantity: 10, amount: -1000 }),
        trade({ date: '2025-01-03T10:00:00.000Z', kind: 'sell', quantity: 4, amount: 440 }),
      ],
      closes: closesOf({ 'IWDA.AS': { '2025-01-02': 100, '2025-01-03': 110 } }),
      from: day('2025-01-02'),
      to: day('2025-01-03'),
    })

    expect(points[1].value).toBeCloseTo(660, 10)
    expect(points[1].invested).toBeCloseTo(600, 10)
  })

  it('holds what was bought before the window without counting it as a flow inside it', () => {
    const { points } = build({
      trades: [trade({ date: '2024-11-05T10:00:00.000Z', quantity: 10, amount: -1000 })],
      closes: closesOf({ 'IWDA.AS': { '2025-01-02': 100, '2025-01-03': 110 } }),
      from: day('2025-01-02'),
      to: day('2025-01-03'),
    })

    expect(points[0].value).toBe(1000)
    expect(points[0].invested).toBe(1000)
    expect(points[1].performance).toBeCloseTo(0.1, 10)
  })

  it('converts each holding at its own day\'s rate, and each contribution at its own', () => {
    const rates: Record<string, number> = { '2025-01-02': 4, '2025-01-03': 5 }
    const { points } = build({
      trades: [trade({ date: '2025-01-02T10:00:00.000Z', quantity: 10, amount: -1000 })],
      closes: closesOf({ 'IWDA.AS': { '2025-01-02': 100, '2025-01-03': 100 } }),
      convertOn: (amount, currency, onDate) =>
        currency === 'EUR' ? amount * rates[onDate.toISOString().split('T')[0]] : null,
      from: day('2025-01-02'),
      to: day('2025-01-03'),
    })

    // Paid in at 4, so that is what it cost in the base currency for good.
    expect(points[1].invested).toBe(4000)
    // Worth the same in euros, and a fifth more in the base currency.
    expect(points[1].value).toBe(5000)
    expect(points[1].performance).toBeCloseTo(0.25, 10)
  })

  it('names a holding it cannot price rather than valuing it at nothing', () => {
    const { points, unpriced } = build({
      trades: [
        trade({ date: '2025-01-02T10:00:00.000Z', quantity: 10, amount: -1000 }),
        trade({ instrumentId: 'us', date: '2025-01-02T10:00:00.000Z', quantity: 5, amount: -500 }),
      ],
      closes: closesOf({ 'IWDA.AS': { '2025-01-02': 100 } }),
      from: day('2025-01-02'),
      to: day('2025-01-02'),
    })

    expect(unpriced).toEqual(['us'])
    expect(points[0].value).toBe(1000)
  })

  // The bug this exists to stop: money that bought a holding the curve cannot
  // value, counted as an inflow the value never answers for, reads as a loss
  // the size of the purchase - and the return wears it for the rest of its life.
  it('leaves the money that bought an unpriced holding out of the return too', () => {
    const { points, unpriced } = build({
      trades: [
        trade({ date: '2025-01-02T10:00:00.000Z', quantity: 10, amount: -1000 }),
        trade({ instrumentId: 'us', date: '2025-01-03T10:00:00.000Z', quantity: 5, amount: -5000 }),
      ],
      closes: closesOf({ 'IWDA.AS': { '2025-01-02': 100, '2025-01-03': 110 } }),
      from: day('2025-01-02'),
      to: day('2025-01-03'),
    })

    expect(unpriced).toEqual(['us'])
    // Only the holding it can price: a tenth on 1,000, and nothing else.
    expect(points[1].performance).toBeCloseTo(0.1, 10)
    expect(points[1].invested).toBe(1000)
    expect(points[1].flow).toBe(0)
  })

  it('names a holding whose currency no rate reaches', () => {
    const { unpriced } = build({
      trades: [
        trade({ instrumentId: 'us', date: '2025-01-02T10:00:00.000Z', quantity: 5, amount: -500, currency: 'USD' }),
      ],
      closes: closesOf({ 'VUSA.AS': { '2025-01-02': 110 } }),
      quoteCurrencyOf: () => 'USD',
      from: day('2025-01-02'),
      to: day('2025-01-02'),
    })

    expect(unpriced).toEqual(['us'])
  })

  it('leaves out a row nobody can place in time', () => {
    const { points } = build({
      trades: [
        trade({ date: '2025-01-02T10:00:00.000Z', quantity: 10, amount: -1000 }),
        trade({ date: 'not a date', quantity: 999, amount: -99999 }),
      ],
      closes: closesOf({ 'IWDA.AS': { '2025-01-02': 100 } }),
      from: day('2025-01-02'),
      to: day('2025-01-02'),
    })

    expect(points[0].value).toBe(1000)
    expect(points[0].invested).toBe(1000)
  })

  // Exactly the rows computePositions sets aside, so the curve and the table
  // cannot end up telling different stories about the same holding.
  it('leaves out a row in a currency the position does not settle in', () => {
    const { points } = build({
      trades: [
        trade({ date: '2025-01-02T10:00:00.000Z', quantity: 10, amount: -1000 }),
        trade({ date: '2025-01-02T11:00:00.000Z', quantity: 10, amount: -1200, currency: 'USD' }),
      ],
      closes: closesOf({ 'IWDA.AS': { '2025-01-02': 100 } }),
      from: day('2025-01-02'),
      to: day('2025-01-02'),
    })

    expect(points[0].value).toBe(1000)
    expect(points[0].invested).toBe(1000)
  })

  // A factor at or below zero compounds into a curve that is upside down from
  // that day on and never recovers - a portfolio reported as down 134% when it
  // is up.
  it('skips a day whose prices cannot be a return rather than inverting the curve', () => {
    const { points } = build({
      trades: [
        trade({ date: '2025-01-02T10:00:00.000Z', quantity: 1, amount: -100 }),
        // Ten thousand paid in on a day the feed prices the whole holding at a
        // fraction of it.
        trade({ date: '2025-01-03T10:00:00.000Z', quantity: 100, amount: -10000 }),
      ],
      closes: closesOf({ 'IWDA.AS': { '2025-01-02': 100, '2025-01-03': 1, '2025-01-04': 2 } }),
      from: day('2025-01-02'),
      to: day('2025-01-04'),
    })

    // The broken day says nothing at all, and the day after it - 1.00 to 2.00
    // on a holding of 101 shares - is measured normally.
    expect(points[1].performance).toBe(0)
    expect(points[2].performance).toBeCloseTo(1, 10)
  })

  // A holding whose feed was never resolved is worth nothing the engine can
  // state, and eighteen months of flat zero in front of the curve divides every
  // yearly rate by a stretch where nothing could be measured at all.
  it('starts on the first day the portfolio is worth anything', () => {
    const { points } = build({
      trades: [
        // Held from January, but nothing prices it until March.
        trade({ instrumentId: 'us', date: '2025-01-02T10:00:00.000Z', quantity: 5, amount: -500 }),
        trade({ date: '2025-03-01T10:00:00.000Z', quantity: 10, amount: -1000 }),
      ],
      closes: closesOf({ 'IWDA.AS': { '2025-03-01': 100, '2025-03-02': 110 } }),
      from: day('2025-01-02'),
      to: day('2025-03-02'),
    })

    expect(points[0].date).toBe('2025-03-01')
    expect(points).toHaveLength(2)
  })

  it('keeps a portfolio sold down to nothing in the middle of its life', () => {
    const { points } = build({
      trades: [
        trade({ date: '2025-01-02T10:00:00.000Z', quantity: 10, amount: -1000 }),
        trade({ date: '2025-01-03T10:00:00.000Z', kind: 'sell', quantity: 10, amount: 1100 }),
      ],
      closes: closesOf({ 'IWDA.AS': { '2025-01-02': 100, '2025-01-03': 110 } }),
      from: day('2025-01-02'),
      to: day('2025-01-04'),
    })

    expect(points).toHaveLength(3)
    expect(points[2].value).toBe(0)
  })

  it('records what crossed the boundary each day, and which way', () => {
    const { points } = build({
      trades: [
        trade({ date: '2025-01-02T10:00:00.000Z', quantity: 10, amount: -1000 }),
        trade({ date: '2025-01-03T10:00:00.000Z', kind: 'dividend', amount: 50 }),
      ],
      closes: closesOf({ 'IWDA.AS': { '2025-01-02': 100, '2025-01-03': 95 } }),
      from: day('2025-01-02'),
      to: day('2025-01-04'),
    })

    expect(points.map(entry => entry.flow)).toEqual([1000, -50, 0])
  })

  it('has nothing to say about a range that ends before it starts', () => {
    const { points } = build({
      trades: [trade({ date: '2025-01-02T10:00:00.000Z', quantity: 10, amount: -1000 })],
      from: day('2025-01-05'),
      to: day('2025-01-02'),
    })

    expect(points).toEqual([])
  })
})

describe('what a cost does to the curve', () => {
  /** A thousand into one holding that then sits perfectly still, so anything the
   *  curve does afterwards is the cost doing it. */
  function withRow(extra: Partial<PositionTrade> & { date: string }) {
    return build({
      trades: [
        trade({ date: '2025-01-02T10:00:00.000Z', quantity: 10, amount: -1000 }),
        trade(extra),
      ],
      closes: closesOf({ 'IWDA.AS': { '2025-01-02': 100, '2025-01-03': 100 } }),
      from: day('2025-01-02'),
      to: day('2025-01-03'),
    })
  }

  // Left out of the chain entirely, a commission is a return nobody earned:
  // the money is gone from the account and the curve never hears about it.
  it('drags the return down by a commission', () => {
    const { points } = withRow({ date: '2025-01-03T10:00:00.000Z', kind: 'fee', amount: -3 })

    expect(points[1].flow).toBeCloseTo(3, 10)
    expect(points[1].performance).toBeCloseTo(-0.003, 10)
  })

  it('lifts it by interest received, exactly as a dividend does', () => {
    const { points } = withRow({ date: '2025-01-03T10:00:00.000Z', kind: 'interest', amount: 5 })

    expect(points[1].performance).toBeCloseTo(0.005, 10)
  })

  // DeGiro's annual exchange connection fee belongs to the account rather than
  // to a share of anything, and dropping it for want of a holding to hang it on
  // loses a real cost.
  it('counts a cost that names no holding at all', () => {
    const { points } = withRow({
      date: '2025-01-03T10:00:00.000Z',
      kind: 'fee',
      amount: -3,
      instrumentId: undefined,
    })

    expect(points[1].performance).toBeCloseTo(-0.003, 10)
  })

  // Read from the sign of the amount rather than from the kind, so the two
  // rows that run the other way are not read backwards.
  it('credits a refunded fee and debits interest charged', () => {
    expect(
      withRow({ date: '2025-01-03T10:00:00.000Z', kind: 'fee', amount: 3 }).points[1].performance
    ).toBeCloseTo(0.003, 10)
    expect(
      withRow({ date: '2025-01-03T10:00:00.000Z', kind: 'interest', amount: -2 }).points[1]
        .performance
    ).toBeCloseTo(-0.002, 10)
  })

  // The money is really gone, so the profit the window states has to be after
  // it - the holding is worth exactly what was paid for it and the account is
  // still down by the commission.
  it('leaves the window short by what the costs took', () => {
    const { points } = withRow({ date: '2025-01-03T10:00:00.000Z', kind: 'fee', amount: -3 })

    expect(windowProfit(points)).toBeCloseTo(-3, 10)
  })

  // An instrument the curve cannot value is out of every figure it states, and
  // its commission goes with it rather than dragging a curve the holding it
  // paid for is not on.
  it('leaves out a cost belonging to a holding it cannot value', () => {
    const { points } = build({
      trades: [
        trade({ date: '2025-01-02T10:00:00.000Z', quantity: 10, amount: -1000 }),
        trade({ date: '2025-01-03T10:00:00.000Z', instrumentId: 'mystery', kind: 'fee', amount: -3 }),
      ],
      closes: closesOf({ 'IWDA.AS': { '2025-01-02': 100, '2025-01-03': 100 } }),
      from: day('2025-01-02'),
      to: day('2025-01-03'),
    })

    expect(points[1].flow).toBe(0)
    expect(points[1].performance).toBeCloseTo(0, 10)
  })
})

describe('the gain a sale realised', () => {
  // Half the holding sold for more than half the basis: 600 back against the
  // 500 that bought it. The rest of the basis stays with what is still held.
  it('is what came back less the basis the sale released', () => {
    const { points } = build({
      trades: [
        trade({ date: '2025-01-02T10:00:00.000Z', quantity: 10, amount: -1000 }),
        trade({ date: '2025-01-03T10:00:00.000Z', kind: 'sell', quantity: 5, amount: 600 }),
      ],
      closes: closesOf({ 'IWDA.AS': { '2025-01-02': 100, '2025-01-03': 120, '2025-01-04': 120 } }),
      from: day('2025-01-02'),
      to: day('2025-01-04'),
    })

    expect(points.map(point => point.realised)).toEqual([0, 100, 0])
    expect(points.map(point => point.invested)).toEqual([1000, 500, 500])
  })

  // Average and FIFO agree exactly on a full exit, and the whole remaining
  // basis has to go with it rather than leaving atto-units behind.
  it('releases the whole basis when the position is closed out', () => {
    const { points } = build({
      trades: [
        trade({ date: '2025-01-02T10:00:00.000Z', quantity: 10, amount: -1000 }),
        trade({ date: '2025-01-03T10:00:00.000Z', kind: 'sell', quantity: 10, amount: 1150 }),
      ],
      closes: closesOf({ 'IWDA.AS': { '2025-01-02': 100, '2025-01-03': 115 } }),
      from: day('2025-01-02'),
      to: day('2025-01-03'),
    })

    expect(windowRealised(points)).toBeCloseTo(150, 10)
    expect(points[points.length - 1].invested).toBeCloseTo(0, 10)
  })

  it('says nothing about a window with no days in it', () => {
    expect(windowRealised([])).toBeNull()
  })
})

describe('annualisedVolatility', () => {
  /** `days` of the same return every day, which has no spread at all. */
  function steady(days: number, daily: number): HistoryPoint[] {
    return Array.from({ length: days }, (_, index) => ({
      date: `2025-01-${String(index + 1).padStart(2, '0')}`,
      value: 100 * (1 + daily) ** index,
      invested: 100,
      gain: 0,
      flow: 0,
      realised: 0,
      performance: (1 + daily) ** index - 1,
    }))
  }

  it('is zero for a curve that returns the same every day', () => {
    expect(annualisedVolatility(steady(60, 0.001))).toBeCloseTo(0, 10)
  })

  // A series alternating +1% and -1% has a daily standard deviation of 1%, and
  // a year of calendar days multiplies its variance by 365.
  it('states the daily spread as a yearly figure', () => {
    const points: HistoryPoint[] = []
    let index = 1
    for (let day = 0; day < 60; day++) {
      index *= day % 2 === 0 ? 1.01 : 1 / 1.01
      points.push({
        date: `2025-${String(Math.floor(day / 28) + 1).padStart(2, '0')}-${String((day % 28) + 1).padStart(2, '0')}`,
        value: 100 * index,
        invested: 100,
        gain: 0,
        flow: 0,
        realised: 0,
        performance: index - 1,
      })
    }

    const volatility = annualisedVolatility(points)
    expect(volatility).not.toBeNull()
    expect(volatility as number).toBeCloseTo(0.01 * Math.sqrt(365), 2)
  })

  // Three days of a portfolio say nothing about how much it moves, and a
  // figure stated from them would be read as though they did.
  it('says nothing over a window too short to measure', () => {
    expect(annualisedVolatility(steady(10, 0.001))).toBeNull()
    expect(annualisedVolatility([])).toBeNull()
  })
})

describe('rebasePerformance', () => {
  it('measures the window from its own first day', () => {
    const points = [
      { date: '2025-03-01', value: 110, invested: 100, gain: 10, flow: 0, realised: 0, performance: 0.1 },
      { date: '2025-03-02', value: 121, invested: 100, gain: 21, flow: 0, realised: 0, performance: 0.21 },
    ]

    const rebased = rebasePerformance(points)

    expect(rebased[0].performance).toBeCloseTo(0, 10)
    expect(rebased[1].performance).toBeCloseTo(0.1, 10)
    // Only the return is restated: what it is worth is what it is worth.
    expect(rebased[1].value).toBe(121)
  })

  it('leaves an empty window alone', () => {
    expect(rebasePerformance([])).toEqual([])
  })
})


function point(date: string, performance = 0): HistoryPoint {
  return { date, value: 100, invested: 100, gain: 0, flow: 0, realised: 0, performance }
}

describe('windowStart', () => {
  const asOf = day('2026-03-15')

  it('measures each window back from today, in UTC days', () => {
    expect(windowStart('1M', asOf)).toBe('2026-02-15')
    expect(windowStart('6M', asOf)).toBe('2025-09-15')
    expect(windowStart('1Y', asOf)).toBe('2025-03-15')
    expect(windowStart('YTD', asOf)).toBe('2026-01-01')
    expect(windowStart('ALL', asOf)).toBeNull()
  })

  // Months are not all the same length, and rolling back from the 31st lands
  // in the month after the one that was asked for.
  it('clamps a day the shorter month does not have', () => {
    expect(windowStart('1M', day('2026-03-31'))).toBe('2026-02-28')
  })
})

describe('sliceHistory', () => {
  const points = [point('2026-01-01', 0.1), point('2026-02-01', 0.21), point('2026-03-01', 0.331)]

  it('keeps only the days the window covers', () => {
    // A month back from the 5th of March starts on the 5th of February, which
    // leaves only the March point.
    const sliced = sliceHistory(points, '1M', day('2026-03-05'))

    expect(sliced.map(entry => entry.date)).toEqual(['2026-03-01'])
  })

  // A chart of the last month has to start at 0%, not at whatever the
  // portfolio had already made before the month began.
  it('measures the return from the window\'s own first day', () => {
    const sliced = sliceHistory(points, 'ALL', day('2026-03-05'))
    expect(sliced[0].performance).toBeCloseTo(0, 10)
    expect(sliced[2].performance).toBeCloseTo(0.21, 10)
  })
})

describe('zeroCrossing', () => {
  it('finds where the level sits between the top and the bottom', () => {
    expect(zeroCrossing(-10, 10)).toBeCloseTo(0.5, 10)
    expect(zeroCrossing(-10, 30)).toBeCloseTo(0.75, 10)
  })

  // Nothing to split: the whole line is on one side of it.
  it('says nothing where the range never crosses zero', () => {
    expect(zeroCrossing(5, 30)).toBeNull()
    expect(zeroCrossing(-30, -5)).toBeNull()
    expect(zeroCrossing(0, 30)).toBeNull()
  })
})

describe('axisTickLabel', () => {
  // Four ticks inside one season all read "Apr 2026" when only the month is
  // shown, which is no axis at all.
  it('names the day inside a short window and the month across a long one', () => {
    expect(axisTickLabel('2026-04-08', 30)).toBe('Apr 8')
    expect(axisTickLabel('2026-04-08', 184)).toBe('Apr 8')
    expect(axisTickLabel('2026-04-08', 1200)).toBe('Apr 2026')
  })
})

describe('downsample', () => {
  it('leaves a window a chart can already draw alone', () => {
    const points = [point('2026-01-01'), point('2026-01-02')]
    expect(downsample(points, 10)).toBe(points)
  })

  it('thins a longer window and still ends on today', () => {
    const points = Array.from({ length: 100 }, (_, index) =>
      point(`2026-01-${String((index % 28) + 1).padStart(2, '0')}`)
    )

    const thinned = downsample(points, 10)

    expect(thinned.length).toBeLessThanOrEqual(11)
    expect(thinned[thinned.length - 1]).toBe(points[points.length - 1])
    expect(thinned[0]).toBe(points[0])
  })
})

describe('xirr', () => {
  it('finds the rate that discounts the flows back to nothing', () => {
    // 1,000 out, 1,100 back a year later.
    expect(xirr([{ day: 0, amount: -1000 }, { day: 365, amount: 1100 }])).toBeCloseTo(0.1, 4)
  })

  it('answers a loss with a negative rate', () => {
    expect(xirr([{ day: 0, amount: -1000 }, { day: 365, amount: 900 }])).toBeCloseTo(-0.1, 4)
  })

  // The whole reason it is money-weighted: the second, larger contribution was
  // in the market for half as long, and the rate has to reflect that.
  it('weights each contribution by how long it was there', () => {
    const rate = xirr([
      { day: 0, amount: -1000 },
      { day: 182, amount: -1000 },
      { day: 365, amount: 2150 },
    ])

    expect(rate).not.toBeNull()
    // Around 10% a year: a tenth on the first and half a tenth on the second.
    expect(rate as number).toBeGreaterThan(0.08)
    expect(rate as number).toBeLessThan(0.12)
  })

  // Money that only ever went one way has no rate that explains it, and a
  // number invented for it would be a fiction.
  it('refuses a set of flows that never came back', () => {
    expect(xirr([{ day: 0, amount: -1000 }, { day: 365, amount: -500 }])).toBeNull()
    expect(xirr([])).toBeNull()
  })
})

describe('windowProfit and moneyWeightedReturn', () => {
  /** A year of holding, bought on day one and worth a tenth more at the end. */
  const year: HistoryPoint[] = [
    { date: '2025-01-01', value: 1000, invested: 1000, gain: 0, flow: 1000, realised: 0, performance: 0 },
    { date: '2026-01-01', value: 1100, invested: 1000, gain: 100, flow: 0, realised: 0, performance: 0.1 },
  ]

  it('counts everything that came out against everything that went in', () => {
    expect(windowProfit(year)).toBeCloseTo(100, 10)
  })

  // A dividend taken out in cash is money made exactly as a price rise is.
  it('counts a dividend taken out as money made', () => {
    const withIncome: HistoryPoint[] = [
      year[0],
      { date: '2025-06-01', value: 1000, invested: 1000, gain: 0, flow: -40, realised: 0, performance: 0 },
      year[1],
    ]

    expect(windowProfit(withIncome)).toBeCloseTo(140, 10)
  })

  it('measures a window that opens on a portfolio already held', () => {
    const later: HistoryPoint[] = [
      { date: '2025-06-01', value: 5000, invested: 4000, gain: 1000, flow: 0, realised: 0, performance: 0.2 },
      { date: '2025-12-01', value: 5500, invested: 4000, gain: 1500, flow: 0, realised: 0, performance: 0.32 },
    ]

    // Only what happened inside the window: the 1,000 it was already up on the
    // first day is not this window's doing.
    expect(windowProfit(later)).toBeCloseTo(500, 10)
  })

  it('states the yearly rate the money itself earned', () => {
    expect(moneyWeightedReturn(year)).toBeCloseTo(0.1, 3)
  })

  it('says nothing over a window too short to annualise', () => {
    expect(
      moneyWeightedReturn([
        year[0],
        { date: '2025-01-10', value: 1100, invested: 1000, gain: 100, flow: 0, realised: 0, performance: 0.1 },
      ])
    ).toBeNull()
  })
})
