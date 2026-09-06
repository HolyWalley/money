import binarySearch from 'binary-search'
import type { Converter } from './currency-conversion'
import type { Trade, TradeKind } from '../../shared/schemas/trade.schema'

/**
 * Positions, cost basis and returns derived from a broker's trade history.
 *
 * Cost basis is average cost. The holdings are accumulating ETFs plus one US
 * stock, and the single sale so far was a complete exit of the position -
 * average and FIFO agree exactly on a full exit - so average cost is chosen
 * for its simplicity at no cost in accuracy. Each trade keeps its own date,
 * quantity and price, so a FIFO pass can be added later without re-importing
 * anything.
 */

export type PositionTrade = Pick<Trade, 'instrumentId' | 'kind' | 'date' | 'quantity' | 'amount' | 'currency'>

/** Why a row was kept out of every figure on the position it names. */
export type ExclusionReason = 'unreadable-date' | 'foreign-currency'

export interface ExcludedTrade {
  trade: PositionTrade
  reason: ExclusionReason
}

export interface Position {
  instrumentId: string
  quantity: number
  /** Remaining cost basis, in the instrument's currency. */
  cost: number
  /** cost / quantity, or 0 once the position is closed. */
  averageCost: number
  realised: number
  dividends: number
  fees: number
  currency: string
  isClosed: boolean
  /** A sale took more than was on hand, so the history starts mid-story. */
  oversold: boolean
  /**
   * Cash was paid for shares the statement never quantified, so the basis
   * below has no holding behind it.
   */
  unquantified: boolean
  /**
   * Rows this position could not absorb, kept whole rather than folded into a
   * figure that means something else or dropped without trace. A statement
   * that mixes currencies inside one instrument, or dates a row unreadably,
   * shows up here instead of skewing the totals.
   */
  excluded: ExcludedTrade[]
}

export type PriceLookup = (instrumentId: string) => number | null

export type QuantityLookup = (instrumentId: string, date: Date) => number

export interface PortfolioSummary {
  cost: number
  marketValue: number
  unrealised: number
  realised: number
  dividends: number
  totalReturn: number
  /**
   * Instruments no close is known for. Their market value and their cost basis
   * are both left out of the totals - both, so `unrealised` stays the
   * difference between two figures that belong together - while the gain they
   * realised and the dividends they paid stay in. Named rather than counted as
   * zero, so the UI can say the valuation is partial instead of showing an
   * understated one as the whole picture.
   */
  missingPrices: string[]
  /**
   * Currencies with no rate into the base. Nothing held in them is knowable in
   * the base currency, not even cash already received, so those positions are
   * left out of every figure above.
   */
  missingCurrencies: string[]
  /**
   * Instruments that cost money for a number of shares no row ever gave. Their
   * basis is withheld along with their value, for the same reason a missing
   * price withholds both: a holding with an unreadable quantity is not a
   * holding worth nothing, and counting its cost against a confident zero
   * reports a parse failure as a total loss.
   */
  unquantified: string[]
}

/**
 * Quantities are stored to eight decimal places, so anything below a
 * nano-share is float residue from summing fractional fills rather than a
 * holding anyone owns.
 */
const QUANTITY_EPSILON = 1e-9

function isZeroQuantity(quantity: number): boolean {
  return Math.abs(quantity) < QUANTITY_EPSILON
}

function snapZero(quantity: number): number {
  return isZeroQuantity(quantity) ? 0 : quantity
}

function kindRank(kind: TradeKind): number {
  return kind === 'buy' ? 0 : 1
}

function isTradeRow(kind: TradeKind): boolean {
  return kind === 'buy' || kind === 'sell'
}

function compareTrades(a: PositionTrade, b: PositionTrade): number {
  const aTime = Date.parse(a.date)
  const bTime = Date.parse(b.date)
  const aUndated = Number.isNaN(aTime)
  const bUndated = Number.isNaN(bTime)

  // Every unreadable date sorts after every readable one, and ties with the
  // others. Subtracting them instead would give NaN, which is falsy, so the
  // comparison would fall through to the kind and stop being transitive - and
  // a non-transitive comparator lets the sort order the valid rows around it
  // however it pleases.
  if (aUndated && bUndated) return 0
  if (aUndated) return 1
  if (bUndated) return -1

  const byTime = aTime - bTime
  if (byTime) return byTime
  // A buy settles before a sale stamped with the same instant, so a fill
  // liquidated the same second does not read as selling what is not yet held.
  return kindRank(a.kind) - kindRank(b.kind)
}

/**
 * Statements arrive in whatever order the broker exports them - DeGiro's is
 * newest first - and a sale applied before its buy produces nonsense, so the
 * order is imposed here rather than trusted. The copy leaves the caller's
 * array alone.
 */
function sortChronologically(trades: PositionTrade[]): PositionTrade[] {
  return [...trades].sort(compareTrades)
}

type HoldingRow = PositionTrade & { instrumentId: string }

/** The rows that say something about a holding, oldest first. */
function holdingRows(trades: PositionTrade[]): HoldingRow[] {
  return sortChronologically(trades).filter(
    // Interest is paid on the cash balance and an adjustment corrects it;
    // neither says anything about a holding, even when one is named.
    (trade): trade is HoldingRow =>
      Boolean(trade.instrumentId) && trade.kind !== 'interest' && trade.kind !== 'adjustment'
  )
}

/**
 * Which currency each instrument's figures are kept in.
 *
 * A buy or a sale is the row that settles in the instrument's currency, and
 * the earliest one wins. A custody fee billed in the account's currency before
 * the export window's first buy would otherwise name the whole position, and
 * every figure on it would then be converted at the wrong rate. Only when an
 * instrument has no trade row at all is there nothing better to go on than the
 * first row that named it.
 */
function settleCurrencies(rows: HoldingRow[]): Map<string, string> {
  const currencies = new Map<string, string>()
  const fromTrade = new Set<string>()

  for (const row of rows) {
    // A row nobody can place in time takes part in nothing, this included.
    if (Number.isNaN(Date.parse(row.date))) continue
    if (fromTrade.has(row.instrumentId)) continue

    if (isTradeRow(row.kind)) {
      currencies.set(row.instrumentId, row.currency)
      fromTrade.add(row.instrumentId)
    } else if (!currencies.has(row.instrumentId)) {
      currencies.set(row.instrumentId, row.currency)
    }
  }

  return currencies
}

function emptyPosition(instrumentId: string, currency: string): Position {
  return {
    instrumentId,
    quantity: 0,
    cost: 0,
    averageCost: 0,
    realised: 0,
    dividends: 0,
    fees: 0,
    currency,
    isClosed: true,
    oversold: false,
    unquantified: false,
    excluded: [],
  }
}

function applySale(position: Position, trade: PositionTrade): void {
  const held = position.quantity
  const sold = Math.min(trade.quantity, held)

  if (trade.quantity > held + QUANTITY_EPSILON) {
    position.oversold = true
  }

  // A sale that takes everything on hand releases the whole remaining basis.
  // Deriving it from the average instead would strand a few atto-units of cost
  // on a fractional exit and report a gain wrong in its last decimal.
  const closes = held - sold <= QUANTITY_EPSILON
  const basisSold = closes ? position.cost : (position.cost / held) * sold

  position.realised += Math.abs(trade.amount) - basisSold
  position.cost = closes ? 0 : position.cost - basisSold
  position.quantity = closes ? 0 : held - sold
}

/** A total order over rows the comparator itself cannot separate. */
function compareExcluded(a: ExcludedTrade, b: ExcludedTrade): number {
  return (
    a.trade.date.localeCompare(b.trade.date) ||
    a.reason.localeCompare(b.reason) ||
    a.trade.kind.localeCompare(b.trade.kind) ||
    a.trade.currency.localeCompare(b.trade.currency) ||
    a.trade.quantity - b.trade.quantity ||
    a.trade.amount - b.trade.amount
  )
}

function settle(position: Position): void {
  position.isClosed = isZeroQuantity(position.quantity)

  if (!position.isClosed) {
    position.averageCost = position.cost / position.quantity
    return
  }

  position.quantity = 0
  position.averageCost = 0

  // Nothing is cleared here. `applySale` already releases the whole remaining
  // basis on the sale that empties the holding, so an ordinary exit arrives
  // with a cost of exactly zero; anything still standing is cash that left the
  // account for a quantity no row ever gave. Clearing it on the strength of
  // "this instrument was sold at some point" would destroy a later buy whose
  // quantity the parser could not read - `quantity` defaults to 0 on the
  // schema, so a hand-entered trade or an unreadable one arrives exactly so.
  position.unquantified = position.cost !== 0
}

/**
 * Every instrument's holding, basis and return from one pass over the trades.
 *
 * A position that has been sold in full stays in the map with its quantity at
 * zero: it still carries the gain that was made and the dividends that were
 * paid, and dropping it would erase the only record that the money was ever
 * earned.
 *
 * A row the position cannot absorb - one in another currency, or one dated
 * unreadably - is listed in `excluded` instead of being folded in, so nothing
 * the statement recorded disappears without saying so.
 */
export function computePositions(trades: PositionTrade[]): Map<string, Position> {
  const rows = holdingRows(trades)
  const currencies = settleCurrencies(rows)
  const positions = new Map<string, Position>()

  for (const trade of rows) {
    const instrumentId = trade.instrumentId

    let position = positions.get(instrumentId)
    if (!position) {
      position = emptyPosition(instrumentId, currencies.get(instrumentId) ?? trade.currency)
      positions.set(instrumentId, position)
    }

    // A row nobody can place in time cannot be ordered against the sales it
    // falls before or after, and the quantity timeline drops it for the same
    // reason, so counting it here would leave the two answers disagreeing
    // about the same history.
    if (Number.isNaN(Date.parse(trade.date))) {
      position.excluded.push({ trade, reason: 'unreadable-date' })
      continue
    }

    // Adding a dollar figure to a pile of euros gives a number in no currency
    // at all, and the summary would go on to convert the whole pile at the
    // euro rate. The row is set aside whole instead.
    if (trade.currency !== position.currency) {
      position.excluded.push({ trade, reason: 'foreign-currency' })
      continue
    }

    switch (trade.kind) {
      case 'buy':
        position.quantity += trade.quantity
        position.cost += Math.abs(trade.amount)
        break
      case 'sell':
        applySale(position, trade)
        break
      case 'dividend':
        // Cash paid out of a holding, not a change in what it cost to own it.
        position.dividends += trade.amount
        break
      case 'fee':
        // Deliberately kept out of the cost basis. Capitalising commissions is
        // defensible - a tax calculation would do it - but it makes the
        // displayed cost disagree with the cash the statement shows leaving
        // the account, which is the figure the user reconciles against.
        position.fees += Math.abs(trade.amount)
        break
    }
  }

  for (const position of positions.values()) {
    settle(position)
    // Two rows nobody can place in time tie in the comparator, so a stable sort
    // leaves them in whichever order the broker exported. Ordering them here
    // keeps computePositions answering the same thing for the same history,
    // however the statement was written.
    position.excluded.sort(compareExcluded)
  }

  return positions
}

interface QuantityTimeline {
  /** Start of each UTC day the holding changed on, ascending. */
  days: number[]
  /** Quantity held at the end of the day at the same index. */
  quantities: number[]
}

function utcDayStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

/**
 * A reusable "what was held on day X" lookup over the whole trade history.
 *
 * Portfolio value over time is a sum of quantity x close x rate for every
 * instrument on every day of the range, so this is asked hundreds of times per
 * chart. Rescanning the trades per day would make that quadratic; each
 * instrument instead gets one ascending list of the days its holding changed
 * on, binary searched per question.
 *
 * Days are UTC calendar days, the same basis the exchange-rate and price
 * caches key on, so a value and the rate it is converted with belong to the
 * same day.
 */
/**
 * The currency each instrument's figures are kept in, over a whole trade list.
 *
 * Exported so that anything else deriving from the same history - the value
 * curve, say - sets aside exactly the rows `computePositions` sets aside, and
 * the two cannot end up telling different stories about one holding.
 */
export function positionCurrencies(trades: PositionTrade[]): Map<string, string> {
  return settleCurrencies(holdingRows(trades))
}

export function createQuantityLookup(trades: PositionTrade[]): QuantityLookup {
  const rows = holdingRows(trades)
  const currencies = settleCurrencies(rows)
  const timelines = new Map<string, QuantityTimeline>()

  for (const trade of rows) {
    if (!isTradeRow(trade.kind)) continue

    const time = Date.parse(trade.date)
    // A row with an unreadable date has no place on a list the search assumes
    // is sorted, and `computePositions` sets one aside for the same reason.
    if (Number.isNaN(time)) continue

    // A row in a currency other than the instrument's is one `computePositions`
    // refuses to absorb; moving the timeline with its shares would leave the
    // two disagreeing about the same history.
    if (trade.currency !== currencies.get(trade.instrumentId)) continue

    let timeline = timelines.get(trade.instrumentId)
    if (!timeline) {
      timeline = { days: [], quantities: [] }
      timelines.set(trade.instrumentId, timeline)
    }

    const last = timeline.quantities.length - 1
    const held = last < 0 ? 0 : timeline.quantities[last]
    const change = trade.kind === 'buy' ? trade.quantity : -Math.min(trade.quantity, held)
    const quantity = snapZero(held + change)
    const day = utcDayStart(new Date(time))

    if (last >= 0 && timeline.days[last] === day) {
      timeline.quantities[last] = quantity
    } else {
      timeline.days.push(day)
      timeline.quantities.push(quantity)
    }
  }

  return (instrumentId, date) => {
    const timeline = timelines.get(instrumentId)
    if (!timeline) return 0

    const found = binarySearch(timeline.days, utcDayStart(date), (day, needle) => day - needle)
    // A miss returns -(insertion point) - 1, and the entry before the
    // insertion point is the last change on or before the day asked about.
    const index = found >= 0 ? found : -found - 2

    return index < 0 ? 0 : timeline.quantities[index]
  }
}

/**
 * How much of an instrument was held at the end of a given day.
 *
 * Convenient for a single question; use `createQuantityLookup` when asking
 * across a range of days, since this rebuilds the timeline every call.
 */
export function quantityHeldOn(trades: PositionTrade[], instrumentId: string, date: Date): number {
  return createQuantityLookup(trades)(instrumentId, date)
}

/**
 * A figure is only usable if it is a real number: a price cache holding a
 * malformed row hands back `Number(record.close)`, which is NaN, and NaN is
 * neither null nor caught by any comparison - it just spreads through every
 * total it touches.
 */
function usable(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toBase(convert: Converter, amount: number, currency: string): number | null {
  return usable(convert(amount, currency))
}

/**
 * The portfolio's headline figures, in the base currency.
 *
 * Two different gaps are reported, because they cost the reader different
 * figures. An instrument with no known close loses its market value and its
 * cost basis - both, so `unrealised` stays the difference between two figures
 * that belong together - but the gain it realised and the dividends it paid
 * are cash already received, known in its own currency without any close, and
 * they stay in. A currency with no rate loses everything held in it, cash
 * included, since none of it can be stated in the base currency at all.
 *
 * Both gaps are named rather than counted as zero: a holding valued at nothing
 * does not read as missing, it reads as worthless.
 */
export function summarizePortfolio(
  positions: Map<string, Position>,
  priceLookup: PriceLookup,
  convert: Converter
): PortfolioSummary {
  let cost = 0
  let marketValue = 0
  let realised = 0
  let dividends = 0
  const missingPrices = new Set<string>()
  const missingCurrencies = new Set<string>()
  const unquantified = new Set<string>()

  for (const [instrumentId, position] of positions) {
    const basis = toBase(convert, position.cost, position.currency)
    const gain = toBase(convert, position.realised, position.currency)
    const income = toBase(convert, position.dividends, position.currency)

    if (basis === null || gain === null || income === null) {
      missingCurrencies.add(position.currency)
      continue
    }

    realised += gain
    dividends += income

    // Cash left the account for shares nothing counted, so this position's
    // basis has no holding behind it. It is closed, which would otherwise make
    // its value a confident zero and turn the whole basis into a reported
    // loss - so it is named and withheld instead, cost and value together.
    if (position.unquantified) {
      unquantified.add(instrumentId)
      continue
    }

    // A closed position needs no close - nothing times a price is nothing -
    // and demanding one would list every instrument ever sold as unpriced and
    // drop the gain it made from the total.
    const price = position.isClosed ? 0 : usable(priceLookup(instrumentId))
    const value = price === null ? null : toBase(convert, price * position.quantity, position.currency)

    if (value === null) {
      missingPrices.add(instrumentId)
      continue
    }

    marketValue += value
    cost += basis
  }

  const unrealised = marketValue - cost

  return {
    cost,
    marketValue,
    unrealised,
    realised,
    dividends,
    // Appreciation alone understates anything that distributes: a dividend is
    // cash already taken out of the price, so a return counting only the price
    // makes an income fund look like a laggard against an accumulating one.
    totalReturn: unrealised + realised + dividends,
    missingPrices: [...missingPrices].sort(),
    missingCurrencies: [...missingCurrencies].sort(),
    unquantified: [...unquantified].sort(),
  }
}
