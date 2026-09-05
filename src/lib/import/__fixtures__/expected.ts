import type { ParsedRowKind } from '../types'

/**
 * What the two fixture statements in this directory must parse to.
 *
 * Both are anonymised: the structure, row order, headers, locale quirks and
 * public identifiers (ISIN, ticker, order id) are the real broker exports'
 * byte for byte, every amount, quantity and date is invented. Every number
 * below was recomputed from the fixture files themselves, so a parser that
 * disagrees with a constant here is wrong about the fixture, not the other way
 * round.
 *
 * Amounts are exact to the cent; compare them with a cents tolerance rather
 * than for binary equality.
 */

export const DEGIRO_FIXTURE = 'degiro-account.csv'
export const REVOLUT_FIXTURE = 'revolut-trading.csv'

export type ExpectedRowCounts = Record<ParsedRowKind, number>

export interface ExpectedPosition {
  isin?: string
  ticker?: string
  /** The instrument name as the statement's own product column spells it. */
  name: string
  /** DeGiro repeats the name inside the buy description, cased differently. */
  nameInDescription?: string
  quantity: number
  /**
   * Sum of the buy rows' cash amounts. Commissions are separate 'fee' rows in
   * both statements, so they are NOT part of this figure.
   */
  cost: number
  currency: string
}

// --- DeGiro (Polish locale, newest row first) -------------------------------

export const expectedDegiroRowTotal = 104

export const expectedDegiroRowCounts: ExpectedRowCounts = {
  buy: 13,
  sell: 0,
  dividend: 0,
  // 12 per-order commissions plus 3 annual exchange connection fees.
  fee: 15,
  interest: 18,
  deposit: 9,
  withdrawal: 0,
  // 24 'Degiro Cash Sweep Transfer' rows paired with 24 'Transfer to/from your
  // Cash Account at flatexDEGIRO Bank' rows. The preview says "48 rows excluded
  // as internal transfers"; none of them may be imported.
  internal: 48,
  // 'Promocja rabat', a promotional rebate the parser has no rule for. It still
  // moves cash, so it must be surfaced rather than dropped.
  unknown: 1,
}

/** Order of first appearance in the file, which is also alphabetical here. */
export const expectedDegiroCurrencies = ['EUR', 'PLN']

export const expectedDegiroPositions: ExpectedPosition[] = [
  {
    isin: 'IE00B5BMR087',
    name: 'ISHARES CORE S&P 500 UCITS ETF USD',
    nameInDescription: 'iShares Core S&P 500 UCITS ETF USD (Acc)',
    quantity: 33,
    cost: 18177.90,
    currency: 'EUR',
  },
  {
    isin: 'IE000716YHJ7',
    name: 'INVESCO FTSE ALL WORLD UCITS ETF ACC',
    nameInDescription: 'Invesco FTSE All World UCITS ETF Acc',
    quantity: 2667,
    cost: 18013.51,
    currency: 'EUR',
  },
]

/**
 * NLFLATEXACNT / 'FLATEX EURO BANKACCOUNT' is the cash sweep's counterparty,
 * not a holding. It sits in the ISIN column of some internal rows and must
 * never become an instrument, which is why only two are expected.
 */
export const expectedDegiroInstrumentCount = 2
export const expectedDegiroNonInstrumentIsin = 'NLFLATEXACNT'

/** Closing balance of the statement, per currency: every row but the internal ones. */
export const expectedDegiroCashBalance: Record<string, number> = { EUR: 8.09, PLN: 0 }

export const expectedDegiroDepositTotal = 36230
export const expectedDegiroFeeTotal = 35.50
export const expectedDegiroDividendTotal = 0
/** Every interest posting in this statement is a zero-amount quarterly notice. */
export const expectedDegiroInterestTotal = 0
export const expectedDegiroRealisedGain = 0

/**
 * One order, three rows: two partial fills of 2 and 5 shares at the same price
 * plus the commission, all carrying this order id. The dedupe key therefore
 * cannot be the order id.
 */
export const expectedDegiroPartialFillOrderId = 'baecbc31-ecb1-4d0b-ba8b-0dd910aa295b'
export const expectedDegiroPartialFillRowCount = 3
export const expectedDegiroPartialFillQuantities = [2, 5]

/**
 * Locale traps the fixture keeps from the real export: the decimal mark is a
 * comma, and thousands inside a description are grouped with U+00A0, not a
 * space, so 'Kupno 1\u00a0540 Invesco...' is 1540 shares and not 1.
 */
export const expectedDegiroLargestBuyQuantity = 1540

export const expectedDegiroUnknownDescriptions = ['Promocja rabat']

// --- Revolut Trading (oldest row first) -------------------------------------

export const expectedRevolutRowTotal = 23

export const expectedRevolutRowCounts: ExpectedRowCounts = {
  buy: 3,
  sell: 1,
  dividend: 14,
  fee: 0,
  interest: 0,
  deposit: 3,
  withdrawal: 0,
  // The migration from Revolut Trading Ltd to Revolut Securities Europe UAB:
  // one row moving the shares, one moving the residual cash.
  internal: 2,
  unknown: 0,
}

export const expectedRevolutCurrencies = ['USD']

export const expectedRevolutPositions: ExpectedPosition[] = [
  {
    ticker: 'ABEV',
    name: 'ABEV',
    quantity: 511.30456789,
    cost: 1220.05,
    currency: 'USD',
  },
]

/** SPGI is bought twice and sold in full, so it must not survive as a position. */
export const expectedRevolutClosedTickers = ['SPGI']

/**
 * Every row but the internal ones. The share migration moves no cash, but the
 * cash migration moves 0.10, so a balance that counts internal rows is 161.64.
 */
export const expectedRevolutCashBalance: Record<string, number> = { USD: 161.54 }
export const expectedRevolutInternalCashAmount = 0.10

export const expectedRevolutDepositTotal = 1215
export const expectedRevolutFeeTotal = 0
export const expectedRevolutInterestTotal = 0

export const expectedRevolutDividendTotals: Record<string, number> = {
  SPGI: 0.38,
  ABEV: 149.50,
}
export const expectedRevolutDividendTotal = 149.88

/**
 * SPGI: 25.00 + 40.00 paid in, 81.71 received back. The sale is a full
 * liquidation of 0.1795366 shares, the exact sum of the two fractional buys.
 */
export const expectedRevolutRealisedGain = 16.71
export const expectedRevolutSaleProceeds = 81.71
export const expectedRevolutSaleCostBasis = 65

/**
 * Which column is authoritative for the cash figure.
 *
 * DeGiro states the traded price exactly: quantity x price equals the cash
 * amount to the cent on all 13 of its buys. Revolut derives its 'Price per
 * share' by rounding total / quantity to two decimals, so quantity x price
 * only approximates the total - on the ABEV buy it is out by 1.97 - and the
 * Total Amount column is the one to trust. Its sale nets less than quantity x
 * price, the spread Revolut keeps.
 */
export const expectedDegiroQuantityTimesPriceMatchesAmount = true
export const expectedRevolutBuyPriceIsRoundedImplied = true
export const expectedRevolutSellNetsLessThanQuantityTimesPrice = true
