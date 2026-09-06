import { findClose, utcDateKey } from '../../shared/market-data'
import { positionCurrencies, type PositionTrade } from './positions'

/**
 * The portfolio's value, cost and return on every day of a range.
 *
 * Nothing here is stored: the curve is rebuilt from the trades, the daily
 * closes and the daily exchange rates every time it is asked for. That is what
 * makes it retroactive - importing a statement that reaches back three years
 * fills in three years of history, where a snapshot written each evening could
 * only ever start today.
 */

/** An amount in one currency, converted into the base on one particular day. */
export type DailyConverter = (amount: number, currency: string, onDate: Date) => number | null

export interface HistoryInputs {
  trades: PositionTrade[]
  /** The market-data symbol an instrument is priced from, where one is resolved. */
  symbolOf: (instrumentId: string) => string | undefined
  /** What the feed quotes a symbol in, which is not always the instrument's own currency. */
  quoteCurrencyOf: (symbol: string) => string | undefined
  /** Closes keyed `symbol:YYYY-MM-DD`, as the market-data client hands them over. */
  closes: Map<string, number>
  convertOn: DailyConverter
  from: Date
  to: Date
}

export interface HistoryPoint {
  /** UTC calendar day, the basis the price and rate caches both key on. */
  date: string
  /** What everything held that day was worth, in the base currency. */
  value: number
  /** Net cash put into what is still held, each contribution at its own day's rate. */
  invested: number
  /** value - invested. */
  gain: number
  /**
   * What crossed the portfolio's boundary that day, in the base currency:
   * positive for money paid in, negative for a sale or a dividend paid out.
   *
   * A cost sits on the positive side of that line. A commission is money the
   * holdings have to answer for and never earned, so it reads as an inflow the
   * value did not rise by - which is the drag it is.
   *
   * Carried per day because every honest measure of return needs it - the
   * time-weighted chain below takes it out of the day's move, and the
   * money-weighted rate is solved from these flows and their dates.
   */
  flow: number
  /**
   * What that day's sales made over the basis they released, in the base
   * currency, each side converted at the rate of the day it happened.
   *
   * Per day rather than cumulative, like `flow`, so any window is the sum of
   * its own days and a sale on the window's first day belongs to it.
   */
  realised: number
  /**
   * Time-weighted return since the first day, as a fraction: 0.27 is +27%.
   *
   * Time-weighted rather than a plain value/invested ratio because that ratio
   * moves when money is paid in even though nothing has been earned or lost -
   * doubling the contributions of a portfolio up 10% halves the number it
   * reports. Chaining daily returns with the day's own flow taken out measures
   * the holdings, not the paying-in schedule, which is what makes two
   * portfolios comparable.
   *
   * Dividends, interest and costs are all in it: what was earned and what it
   * took to earn it.
   */
  performance: number
}

export interface PortfolioHistory {
  points: HistoryPoint[]
  /**
   * Instruments the curve leaves out of every figure - no symbol chosen, no
   * close in reach, or no rate into the base. Named rather than silently
   * dropped: a curve missing a holding reads as a portfolio that is smaller,
   * not as one that is incomplete.
   */
  unpriced: string[]
}

/** Rows that move a holding or pay out of one. */
const POSITION_KINDS = new Set(['buy', 'sell', 'dividend'])

/**
 * Rows that move no shares but are still the portfolio's own money.
 *
 * A commission and a quarterly interest posting say nothing about what is
 * held, which is why they are not position rows - but leaving them out
 * altogether reports a return nobody earned, flattered by every fee the
 * account was ever charged. Many of them name no holding at all: DeGiro's
 * annual exchange connection fee belongs to the account, not to a share of
 * anything.
 */
const COST_KINDS = new Set(['fee', 'interest'])

/**
 * Quantities are stored to eight decimal places, so anything below a
 * nano-share is float residue from summing fractional fills.
 */
const QUANTITY_EPSILON = 1e-9

const DAY_MS = 24 * 60 * 60 * 1000

/** Bounds a range that a bad date could otherwise make unbounded. */
const MAX_DAYS = 30 * 366

interface Holding {
  quantity: number
  /** Remaining basis in the instrument's own currency, mirroring computePositions. */
  cost: number
  /** The same basis in the base currency, each buy converted at its own day's rate. */
  costBase: number
}

function utcDayStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function historyRows(
  trades: PositionTrade[],
  currencies: Map<string, string>
): PositionTrade[] {
  return trades
    .filter(trade => {
      // A row nobody can place in time cannot be put on a timeline at all, and
      // computePositions sets one aside for the same reason.
      if (Number.isNaN(Date.parse(trade.date))) return false

      // A cost is cash, not shares, so neither test below applies to it: it
      // needs no holding to belong to, and the currency it settled in is
      // converted like any other rather than having to match a position's.
      if (COST_KINDS.has(trade.kind)) return true

      if (!trade.instrumentId || !POSITION_KINDS.has(trade.kind)) return false
      // A row in a currency the position does not settle in is one the table
      // refuses to absorb; counting it here would leave the curve and the
      // holdings disagreeing about the same history.
      return trade.currency === currencies.get(trade.instrumentId)
    })
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
}

/** Every symbol the price cache holds at least one close for. */
function symbolsWithCloses(closes: Map<string, number>): Set<string> {
  const symbols = new Set<string>()
  for (const key of closes.keys()) {
    symbols.add(key.slice(0, key.lastIndexOf(':')))
  }
  return symbols
}

/**
 * The instruments the curve can value, and therefore the only ones it counts
 * at all.
 *
 * A holding with no symbol contributes no value on any day. Counting the money
 * that bought it anyway - as an inflow the value never answers for - reads as a
 * loss the size of the purchase, and the return curve wears it for good. So an
 * instrument the curve cannot price is out of every figure it states: its
 * value, its cost, and its flows. What is left out is named.
 */
function valuableInstruments(
  rows: PositionTrade[],
  { symbolOf, quoteCurrencyOf, closes, convertOn, to }: HistoryInputs,
  settleCurrencies: Map<string, string>
): Set<string> {
  const priced = symbolsWithCloses(closes)
  const valuable = new Set<string>()
  const rejected = new Set<string>()

  for (const row of rows) {
    const instrumentId = row.instrumentId
    // An account-level cost names no instrument, so there is nothing here to
    // judge: it is neither valuable nor rejected, and it is kept either way.
    if (!instrumentId) continue
    if (valuable.has(instrumentId) || rejected.has(instrumentId)) continue

    const symbol = symbolOf(instrumentId)
    const quoteCurrency = symbol ? quoteCurrencyOf(symbol) : undefined
    const settleCurrency = settleCurrencies.get(instrumentId)

    const priceable =
      symbol !== undefined &&
      priced.has(symbol) &&
      quoteCurrency !== undefined &&
      convertOn(1, quoteCurrency, to) !== null &&
      settleCurrency !== undefined &&
      convertOn(1, settleCurrency, to) !== null

    if (priceable) valuable.add(instrumentId)
    else rejected.add(instrumentId)
  }

  return valuable
}

export function buildPortfolioHistory(inputs: HistoryInputs): PortfolioHistory {
  const { trades, symbolOf, quoteCurrencyOf, closes, convertOn, from, to } = inputs
  const settleCurrencies = positionCurrencies(trades)
  const allRows = historyRows(trades, settleCurrencies)
  const valuable = valuableInstruments(allRows, inputs, settleCurrencies)

  const rows = allRows.filter(row => !row.instrumentId || valuable.has(row.instrumentId))
  const holdings = new Map<string, Holding>()
  const unpriced = new Set(
    allRows
      .map(row => row.instrumentId)
      .filter((instrumentId): instrumentId is string => Boolean(instrumentId))
      .filter(instrumentId => !valuable.has(instrumentId))
  )
  const points: HistoryPoint[] = []

  const startDay = utcDayStart(from)
  const endDay = utcDayStart(to)
  if (endDay < startDay) return { points, unpriced: [] }

  let cursor = 0
  let investedBase = 0
  let realisedBase = 0
  let performanceIndex = 1
  let previousValue: number | null = null

  /** Applies one row and answers what it moved into or out of the holdings, in base. */
  const apply = (trade: PositionTrade): number => {
    // A cost moves no shares, so all it can do is show up in the day's flow -
    // as the opposite of what the money did. A commission of -3 is money the
    // holdings have to answer for and did not earn, which is an inflow of 3
    // the value never rose by; interest received is an outflow, exactly as a
    // dividend is. Taken from the signed amount rather than a rule per kind,
    // so a charge and a refund each land the right way round.
    if (COST_KINDS.has(trade.kind)) {
      const amountBase = convertOn(trade.amount, trade.currency, new Date(trade.date))
      // No rate into the base, and no holding to name in `unpriced` either.
      // Counting it as zero is what the curve did with every cost until now.
      return -(amountBase ?? 0)
    }

    const instrumentId = trade.instrumentId as string
    let holding = holdings.get(instrumentId)
    if (!holding) {
      holding = { quantity: 0, cost: 0, costBase: 0 }
      holdings.set(instrumentId, holding)
    }

    const tradeDate = new Date(trade.date)
    const cash = Math.abs(trade.amount)
    const cashBase = convertOn(cash, trade.currency, tradeDate)
    // No rate into the base means this row's money cannot be stated at all.
    // Counting it as zero would understate what was paid in, so the instrument
    // is reported as incomplete instead of quietly skewing the return.
    if (cashBase === null) unpriced.add(instrumentId)

    if (trade.kind === 'buy') {
      holding.quantity += trade.quantity
      holding.cost += cash
      holding.costBase += cashBase ?? 0
      return cashBase ?? 0
    }

    if (trade.kind === 'sell') {
      const held = holding.quantity
      const sold = Math.min(trade.quantity, held)
      // A sale that takes everything on hand releases the whole remaining
      // basis; deriving it from the average would strand atto-units of cost.
      const closesOut = held - sold <= QUANTITY_EPSILON
      const share = held > 0 ? sold / held : 0
      const released = closesOut ? holding.costBase : holding.costBase * share

      realisedBase += (cashBase ?? 0) - released
      holding.cost = closesOut ? 0 : holding.cost - holding.cost * share
      holding.costBase = closesOut ? 0 : holding.costBase - released
      holding.quantity = closesOut ? 0 : held - sold
      return -(cashBase ?? 0)
    }

    // A dividend is cash leaving the holdings for the account. The value drops
    // by it and no return was lost, which is exactly what an outward flow says.
    return -(cashBase ?? 0)
  }

  // Anything dated before the range still decides what is held on its first
  // day, so it is applied without counting as a flow inside the window.
  while (cursor < rows.length && utcDayStart(new Date(rows[cursor].date)) < startDay) {
    apply(rows[cursor])
    cursor++
  }

  const days = Math.min(Math.floor((endDay - startDay) / DAY_MS), MAX_DAYS)

  // Sales before the window opened released their basis without belonging to
  // any day in it, so the running total starts from where they left it.
  let realisedBefore = realisedBase

  for (let offset = 0; offset <= days; offset++) {
    const day = startDay + offset * DAY_MS
    const date = new Date(day)
    let flow = 0

    while (cursor < rows.length && utcDayStart(new Date(rows[cursor].date)) <= day) {
      flow += apply(rows[cursor])
      cursor++
    }

    const realised = realisedBase - realisedBefore
    realisedBefore = realisedBase

    investedBase = 0
    let value = 0

    for (const [instrumentId, holding] of holdings) {
      investedBase += holding.costBase
      if (holding.quantity <= QUANTITY_EPSILON) continue

      const symbol = symbolOf(instrumentId)
      const close = symbol ? findClose(closes, symbol, date) : null
      const quoteCurrency = symbol ? quoteCurrencyOf(symbol) : undefined
      const worth =
        close === null || !quoteCurrency
          ? null
          : convertOn(holding.quantity * close, quoteCurrency, date)

      if (worth === null) {
        unpriced.add(instrumentId)
        continue
      }
      value += worth
    }

    // A day nothing was held has no return to measure, and dividing by it would
    // hand back Infinity. The chain simply resumes on the next day something is.
    if (previousValue !== null && previousValue > 0) {
      const factor = (value - flow) / previousValue
      // More money went in than the holdings are worth at the close, which is
      // not a return at all - it is a day the prices are missing or wrong.
      // Compounding a factor at or below zero turns the whole curve upside
      // down from that day on and never recovers, so the day is skipped as the
      // gap it is.
      if (factor > 0 && Number.isFinite(factor)) performanceIndex *= factor
    }
    previousValue = value

    points.push({
      date: utcDateKey(date),
      value,
      invested: investedBase,
      gain: value - investedBase,
      flow,
      realised,
      performance: performanceIndex - 1,
    })
  }

  return { points: fromFirstValued(points), unpriced: [...unpriced].sort() }
}

/**
 * The curve from the first day it is worth anything.
 *
 * A holding whose price feed was never resolved is worth nothing the engine can
 * state, so a portfolio that held only those for its first eighteen months
 * draws eighteen months of flat zero - and every rate measured over the whole
 * window is then divided by a stretch where nothing could be measured at all,
 * which is what makes the yearly figure read as half what it should.
 *
 * Only the leading days go. A portfolio genuinely sold down to nothing in the
 * middle of its life is history worth drawing.
 */
function fromFirstValued(points: HistoryPoint[]): HistoryPoint[] {
  const start = points.findIndex(point => point.value > 0)
  if (start <= 0) return start === 0 ? points : []

  return points.slice(start)
}

/**
 * The same curve measured from a later starting point.
 *
 * Value and gain are absolute figures that mean the same thing whatever window
 * they are read in, but a return does not: a chart of the last month has to
 * start at 0% on the first day of that month, not at whatever the portfolio
 * had made since the beginning.
 */
export function rebasePerformance(points: HistoryPoint[]): HistoryPoint[] {
  if (points.length === 0) return points

  const base = 1 + points[0].performance
  if (base <= 0) return points

  return points.map(point => ({
    ...point,
    performance: (1 + point.performance) / base - 1,
  }))
}

/**
 * How a day is labelled on the axis under the curve.
 *
 * A chart puts roughly a dozen ticks across whatever window it is given, so
 * anything up to about a year has them a fortnight or so apart: labelled by
 * month, half of them would repeat the one before. Past a year the ticks are
 * months apart and the year is what tells them apart instead.
 */
export const TICKS_BY_MONTH_FROM_DAYS = 400

const monthLabel = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const dayLabel = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

export function axisTickLabel(dateKey: string, spanDays: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  return spanDays > TICKS_BY_MONTH_FROM_DAYS ? monthLabel.format(date) : dayLabel.format(date)
}

/**
 * Where zero sits between the top and bottom of a range, as a fraction from the
 * top - or null where the range never crosses it.
 *
 * What a chart needs to paint the line above the level green and the part below
 * it red: a gradient with both colours meeting at exactly this offset does it in
 * one stroke, where splitting the data into two series would leave a gap at
 * every crossing.
 */
export function zeroCrossing(min: number, max: number): number | null {
  if (min >= 0 || max <= 0) return null
  return max / (max - min)
}

/** The windows a curve can be read over. 'ALL' is everything there is. */
export type HistoryPeriod = '1M' | '6M' | 'YTD' | '1Y' | 'ALL'

export const HISTORY_PERIODS: readonly HistoryPeriod[] = ['1M', '6M', 'YTD', '1Y', 'ALL']

export const PERIOD_LABELS: Record<HistoryPeriod, string> = {
  '1M': '1M',
  '6M': '6M',
  YTD: 'YTD',
  '1Y': '1Y',
  ALL: 'All',
}

/** Months are not all the same length, so the last of a long one has to be clamped. */
function shiftMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() - months
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)))
}

/** The first day a window covers, or null for a window that covers everything. */
export function windowStart(period: HistoryPeriod, asOf: Date): string | null {
  switch (period) {
    case '1M':
      return utcDateKey(shiftMonths(asOf, 1))
    case '6M':
      return utcDateKey(shiftMonths(asOf, 6))
    case 'YTD':
      return utcDateKey(new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1)))
    case '1Y':
      return utcDateKey(shiftMonths(asOf, 12))
    case 'ALL':
      return null
  }
}

/**
 * The part of the curve a window covers, with its return measured from the
 * window's own first day rather than from the portfolio's.
 */
export function sliceHistory(
  points: HistoryPoint[],
  period: HistoryPeriod,
  asOf: Date
): HistoryPoint[] {
  const start = windowStart(period, asOf)
  const inWindow = start === null ? points : points.filter(point => point.date >= start)
  return rebasePerformance(inWindow)
}

/**
 * Every nth point, where a window holds more than a chart can draw.
 *
 * The last point is always kept: it is today's figure, the one the headline
 * states, and dropping it would leave the curve ending on a stale day.
 */
export function downsample(points: HistoryPoint[], max: number): HistoryPoint[] {
  if (points.length <= max || max < 2) return points

  const step = Math.ceil(points.length / max)
  const kept = points.filter((_, index) => index % step === 0)

  const last = points[points.length - 1]
  if (kept[kept.length - 1] !== last) kept.push(last)

  return kept
}

/**
 * What the window actually made, in money.
 *
 * Everything that came out less everything that went in, against what it is
 * worth now - so a dividend taken out in cash counts as money made exactly as a
 * price rise does, and paying more in does not.
 */
export function windowProfit(points: HistoryPoint[]): number | null {
  if (points.length === 0) return null

  const first = points[0]
  const last = points[points.length - 1]
  // What was already held when the window opened, before that day's own flows.
  const opening = first.value - first.flow
  const net = points.reduce((total, point) => total + point.flow, 0)

  return last.value - opening - net
}

/**
 * What the window's sales made, in the base currency.
 *
 * Every day's own figure added up, so a sale on the window's first day counts
 * inside it - the same convention `windowProfit` uses for that day's flows.
 */
export function windowRealised(points: HistoryPoint[]): number | null {
  if (points.length === 0) return null

  return points.reduce((total, point) => total + point.realised, 0)
}

/**
 * Below this many daily returns a standard deviation is noise about noise: the
 * shortest window on offer is a month, which clears it with a fortnight over.
 */
const MIN_VOLATILITY_DAYS = 20

/**
 * Calendar days, because the curve is walked day by day rather than session by
 * session. That is not an approximation of the trading-day convention but the
 * same answer by another route: a weekend contributes a zero return, which
 * dilutes the daily variance by exactly the fraction of days the market was
 * shut, and multiplying by 365 puts it back.
 */
const DAYS_PER_YEAR = 365

/**
 * How widely the daily return varied, as a yearly figure.
 *
 * Measured on the time-weighted chain rather than on the value, so a day money
 * was paid in does not read as a day the portfolio jumped. Null over a window
 * too short to say anything about, which is honest: three days of a portfolio
 * tell you nothing about how much it moves.
 */
export function annualisedVolatility(points: HistoryPoint[]): number | null {
  const returns: number[] = []

  for (let index = 1; index < points.length; index++) {
    const previous = 1 + points[index - 1].performance
    // A chain that has not started, or one a bad day knocked to nothing, has
    // no return to take from it.
    if (previous <= 0) continue
    returns.push((1 + points[index].performance) / previous - 1)
  }

  if (returns.length < MIN_VOLATILITY_DAYS) return null

  const mean = returns.reduce((total, value) => total + value, 0) / returns.length
  // Sample variance: the mean is estimated from the same series, so dividing
  // by the count would understate the spread.
  const variance =
    returns.reduce((total, value) => total + (value - mean) ** 2, 0) / (returns.length - 1)

  return Math.sqrt(variance * DAYS_PER_YEAR)
}

interface Cashflow {
  /** Days since the first flow. */
  day: number
  amount: number
}

const XIRR_ITERATIONS = 80
const XIRR_TOLERANCE = 1e-7
/** Below -100% a year the discounting itself stops being defined. */
const XIRR_FLOOR = -0.9999
const XIRR_CEILING = 1000

function netPresentValue(flows: Cashflow[], rate: number): number {
  return flows.reduce(
    (total, flow) => total + flow.amount / (1 + rate) ** (flow.day / 365),
    0
  )
}

/**
 * The rate that makes a set of dated cashflows worth nothing today: XIRR.
 *
 * Bisection rather than Newton-Raphson. It is slower and it cannot fail: a
 * portfolio topped up monthly gives a polynomial with several sign changes,
 * where Newton happily walks off to an imaginary root or oscillates forever,
 * and a wrong rate stated confidently is worse than no rate at all.
 */
export function xirr(flows: Cashflow[]): number | null {
  const positive = flows.some(flow => flow.amount > 0)
  const negative = flows.some(flow => flow.amount < 0)
  // Money only ever went one way. There is no rate that explains that, and
  // any number invented for it would be a fiction.
  if (!positive || !negative) return null

  let low = XIRR_FLOOR
  let high = XIRR_CEILING
  let lowValue = netPresentValue(flows, low)
  let highValue = netPresentValue(flows, high)

  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue)) return null
  if (lowValue * highValue > 0) return null

  for (let iteration = 0; iteration < XIRR_ITERATIONS; iteration++) {
    const middle = (low + high) / 2
    const value = netPresentValue(flows, middle)

    if (Math.abs(value) < XIRR_TOLERANCE || high - low < XIRR_TOLERANCE) {
      return middle
    }

    if (value * lowValue < 0) {
      high = middle
      highValue = value
    } else {
      low = middle
      lowValue = value
    }
  }

  return (low + high) / 2
}

/**
 * The money-weighted return of a window, as a yearly rate.
 *
 * Time-weighted is what the curve is drawn from, because it measures the
 * holdings rather than the paying-in schedule. This is the other half of the
 * answer: what the money itself earned, given how much of it was there and for
 * how long. Buying more of something just before it climbs earns more here and
 * changes nothing there.
 *
 * The window opens with whatever was already held, counted as if it had been
 * bought that morning, and closes with what it is all worth.
 */
export function moneyWeightedReturn(points: HistoryPoint[]): number | null {
  if (points.length < 2) return null

  const first = points[0]
  const last = points[points.length - 1]
  const days = daysBetween(first.date, last.date)
  if (days < MIN_ANNUALISED_DAYS) return null

  const flows: Cashflow[] = []
  const opening = first.value - first.flow
  if (opening !== 0) flows.push({ day: 0, amount: -opening })

  for (const point of points) {
    if (point.flow === 0) continue
    flows.push({ day: daysBetween(first.date, point.date), amount: -point.flow })
  }

  flows.push({ day: days, amount: last.value })

  return xirr(flows)
}

function daysBetween(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00.000Z`).getTime()
  const end = new Date(`${to}T00:00:00.000Z`).getTime()
  return Math.round((end - start) / DAY_MS)
}

/**
 * The shortest window worth stating a yearly rate over.
 *
 * Annualising a fortnight compounds a fortnight's luck into a year, so nothing
 * under a month gets a rate at all.
 */
export const MIN_ANNUALISED_DAYS = 30
