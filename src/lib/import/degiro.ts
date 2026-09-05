import { hashParts, makeExternalId, type ParsedRow, type ParsedRowKind, type ParsedStatement, type StatementParser } from './types'

/**
 * DeGiro's Account.csv, verified against a Polish-locale export.
 *
 * Two columns of the header are unnamed because Change and Balance each span a
 * currency and an amount column, so the header is 12 fields with blanks at 8
 * and 10. That shape is the file's signature and detect() leans on it.
 */
const HEADER_FIELDS = ['date', 'time', 'value date', 'product', 'isin', 'description', 'fx', 'change', '', 'balance', '', 'order id']

const COLUMN = {
  date: 0,
  time: 1,
  product: 3,
  isin: 4,
  description: 5,
  changeCurrency: 7,
  changeAmount: 8,
  balanceCurrency: 9,
  orderId: 11,
} as const

/**
 * The cash sweep posts against 'FLATEX EURO BANKACCOUNT' under this pseudo-ISIN.
 * It is the flatex bank account the broker parks idle cash in, not a security,
 * so it must never reach the instrument list.
 */
export const DEGIRO_CASH_ACCOUNT_ISIN = 'NLFLATEXACNT'

/**
 * A number the way DeGiro writes one, tolerating either locale's separators:
 * an integer part optionally grouped by a space or U+00A0, then a decimal
 * comma or point. Requiring groups to be exactly three digits keeps a product
 * name that starts with a digit from being swallowed into the quantity.
 */
const DECIMAL = '\\d+(?:[ \\u00a0]\\d{3})*(?:[.,]\\d+)?'

/**
 * What makes a row a trade: the description ends with an @-price, a currency
 * and a parenthesised ISIN. Structural rather than verbal on purpose - the user
 * can switch DeGiro's interface language, and 'Kupno' would stop matching.
 */
const TRADE_TAIL = new RegExp(`@(${DECIMAL})\\s+([A-Z]{3})\\s*\\(([A-Z0-9]{12})\\)\\s*$`)

/**
 * The quantity as the description spells it, which is exact where one derived
 * from the rounded cash column is not.
 *
 * A comma or point may group or may be the decimal mark - which is what
 * statedQuantityReadings works out - so any run of digits after one is taken.
 * A SPACE is different: it only ever groups thousands, so it counts only when
 * exactly three digits follow. Letting it span any digits swallowed the start
 * of a product name that opens with a number ('10 21 Shares Bitcoin ETP' read
 * as 1021), which the cash then contradicted on every such row.
 */
const STATED_QUANTITY = /^\S+\s+(\d+(?:(?:[ \u00a0\u202f]\d{3})|(?:[.,]\d+))*)\s/

const BUY_HINTS = ['kupno', 'buy']
const SELL_HINTS = ['sprzedaz', 'sell']

const INTERNAL_PREFIXES = ['transfer to your cash account at', 'transfer from your cash account at']
const INTERNAL_CONTAINS = 'cash sweep transfer'

const FEE_HINTS = ['oplata', 'exchange connection fee']
const DEPOSIT_DESCRIPTIONS = ['depozyt', 'deposit']
const INTEREST_HINT = 'interest'

/** Shares are fractional at some brokers, so the derived quantity is never rounded to an integer. */
const QUANTITY_PRECISION = 1e8

/**
 * How far the stated and derived quantities may sit apart and still be the
 * same number.
 *
 * DeGiro rounds the cash leg to the cent, so abs(cash) / price misses the true
 * quantity by up to half a cent's worth of shares - 457,20 / 6,263 is 73.0002
 * rather than 73. That slack scales with the size of the position instead of
 * being a fixed number of shares, since half a cent buys 0.0008 of a 6,26 EUR
 * ETF but only 0.000008 of a 620 EUR one, so the comparison is relative, with
 * a floor for the smallest trades. Anything further apart is a real
 * disagreement, or a description read the wrong way round.
 */
const QUANTITY_TOLERANCE_RATIO = 1e-3
const QUANTITY_TOLERANCE_FLOOR = 0.01

interface CsvRecord {
  fields: string[]
  raw: string
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function parseCsv(text: string): CsvRecord[] {
  const records: CsvRecord[] = []
  let fields: string[] = []
  let field = ''
  let quoted = false
  let start = 0
  let i = 0

  const endRecord = (end: number) => {
    fields.push(field)
    field = ''
    records.push({ fields, raw: text.slice(start, end) })
    fields = []
  }

  while (i < text.length) {
    const char = text[i]

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
        i++
        continue
      }
      field += char
      i++
      continue
    }

    if (char === '"') {
      quoted = true
      i++
      continue
    }

    if (char === ',') {
      fields.push(field)
      field = ''
      i++
      continue
    }

    if (char === '\n' || char === '\r') {
      const end = i
      if (char === '\r' && text[i + 1] === '\n') i++
      i++
      endRecord(end)
      start = i
      continue
    }

    field += char
    i++
  }

  if (i > start) endRecord(i)

  return records
}

/**
 * The decimal mark is whichever of ',' and '.' comes last; anything before it
 * groups thousands. That reads both the Polish export ('1 697,99') and the
 * English one ('1,697.99'), and DeGiro always writes the fractional part of a
 * money figure, so a lone separator is never an unmarked thousands group.
 */
function parseDecimal(text: string): number | null {
  // \s already covers U+00A0 and U+202F, the spaces DeGiro groups thousands with.
  const cleaned = text.replace(/\s/g, '')
  if (!cleaned) return null

  const decimalAt = Math.max(cleaned.lastIndexOf(','), cleaned.lastIndexOf('.'))
  const normalised = decimalAt < 0
    ? cleaned
    : `${cleaned.slice(0, decimalAt).replace(/[.,]/g, '')}.${cleaned.slice(decimalAt + 1)}`

  const value = Number(normalised)
  return Number.isFinite(value) ? value : null
}

/** Lowercased, unaccented and single-spaced, so 'Opłata' and 'Sprzedaż' compare as ASCII. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    // 'ł' has no canonical decomposition, so NFD alone would leave it behind.
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const DATE_COLUMN = /^(\d{2})-(\d{2})-(\d{4})$/
// Range-checked rather than merely shaped, because the digits are appended to
// the date verbatim: '24:00' would build an instant that rolls onto the next
// calendar day, and '25:70' one that parses to nothing at all, both silently.
const TIME_COLUMN = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * The row's date as an instant, so that rows sharing a day still sort by the
 * order they were executed in: a plain YYYY-MM-DD ties every fill of a day at
 * midnight, and a sell can then be stored ahead of the buy it closes.
 *
 * The Time column is CET/CEST wall clock, and converting it to a true UTC
 * instant would move a late-evening row onto the next calendar day. DeGiro's
 * own date is the one the rest of the app has to agree with, so the time is
 * appended to it as if it were UTC: the result is an ordering key on a stated
 * calendar day, not a claim about the exact instant of execution.
 */
function toTimestamp(dateText: string, timeText: string, warnings: string[]): string {
  const date = DATE_COLUMN.exec(dateText)
  if (!date) {
    if (dateText) warnings.push(`Unrecognised date "${dateText}"`)
    return dateText
  }

  const time = TIME_COLUMN.exec(timeText)
  if (timeText && !time) warnings.push(`Unrecognised time "${timeText}"`)
  const clock = time ? `${time[1]}:${time[2]}` : '00:00'

  return `${date[3]}-${date[2]}-${date[1]}T${clock}:00.000Z`
}

function roundQuantity(value: number): number {
  return Math.round(value * QUANTITY_PRECISION) / QUANTITY_PRECISION
}

/**
 * Every way the description's quantity can be read.
 *
 * '1 540' is 1540 in either locale, but a bare '1,540' is 1540 shares in an
 * English export and 1,54 of one in a Polish export, so both readings are
 * returned and the cash amount picks between them. Every other shape has a
 * single reading: a space only ever groups thousands, a separator that repeats
 * only ever groups, and one that is not followed by exactly three digits is a
 * decimal mark.
 */
function statedQuantityReadings(text: string): number[] {
  const decimal = parseDecimal(text)
  const readings = decimal === null ? [] : [decimal]

  // Three digits after a space are thousands only if the cash says so. A
  // product name may itself open with a number - '10 123 Shares of X' is ten
  // shares, not ten thousand - so the digits before the space are offered too,
  // and the cash picks. Silently: a reading the cash confirms is not a
  // disagreement worth showing anyone.
  const leading = /^(\d+)[ \u00a0\u202f]/.exec(text)
  if (leading) {
    const value = Number(leading[1])
    if (Number.isFinite(value) && !readings.includes(value)) {
      readings.push(value)
    }
  }

  const cleaned = text.replace(/\s/g, '')
  const separators = cleaned.match(/[.,]/g)
  if (!separators) return readings

  const grouped = Number(cleaned.replace(/[.,]/g, ''))
  // No number carries two decimal marks, so a repeated separator is grouping;
  // one of each, as in '1,540.20', already says which mark is which.
  if (separators.length > 1) {
    return separators.every((separator) => separator === separators[0]) ? [grouped] : readings
  }

  // A space inside the number has already claimed the grouping role.
  const ambiguous = !/\s/.test(text) && /^\d{1,3}[.,]\d{3}$/.test(cleaned)
  return ambiguous ? [...readings, grouped] : readings
}

function agreesWithCash(stated: number, derived: number): boolean {
  return Math.abs(stated - derived) <= Math.max(QUANTITY_TOLERANCE_FLOOR, Math.abs(stated) * QUANTITY_TOLERANCE_RATIO)
}

function isCashAccount(isin: string): boolean {
  return isin.trim().toUpperCase() === DEGIRO_CASH_ACCOUNT_ISIN
}

/**
 * The security a row is about, or nothing at all. Refusing the cash account
 * here rather than at each call site is what keeps 'FLATEX EURO BANKACCOUNT'
 * out of the instrument list however the row is later classified.
 */
function security(isinField: string, productField: string): { isin?: string, instrumentName?: string } {
  if (isCashAccount(isinField)) return {}
  const isin = isinField.trim().toUpperCase()
  return { isin: isin || undefined, instrumentName: productField || undefined }
}

function isInternal(description: string): boolean {
  return description.includes(INTERNAL_CONTAINS) || INTERNAL_PREFIXES.some((prefix) => description.startsWith(prefix))
}

function hintedDirection(description: string): ParsedRowKind | null {
  if (BUY_HINTS.some((hint) => description.startsWith(hint))) return 'buy'
  if (SELL_HINTS.some((hint) => description.startsWith(hint))) return 'sell'
  return null
}

function looksLikeHeader(fields: string[]): boolean {
  if (fields.length < HEADER_FIELDS.length) return false
  return HEADER_FIELDS.every((name, index) => normalise(fields[index] ?? '') === name)
}

export function detectDegiro(text: string): boolean {
  const [line] = stripBom(text).split(/\r?\n/, 1)
  if (!line) return false

  const [header] = parseCsv(line)
  return header !== undefined && looksLikeHeader(header.fields)
}

function parseTradeRow(
  description: string,
  tail: RegExpExecArray,
  amount: number,
  warnings: string[]
): { kind: ParsedRowKind, isin: string, price: number | null, quantity: number | undefined } {
  const isin = tail[3]
  const price = parseDecimal(tail[1])
  const normalised = normalise(description)
  const hint = hintedDirection(normalised)

  let kind: ParsedRowKind
  if (amount === 0) {
    kind = hint ?? 'buy'
    warnings.push('Trade moved no cash, so its direction was read from the description')
  } else {
    kind = amount > 0 ? 'sell' : 'buy'
    if (hint && hint !== kind) {
      warnings.push(`Description reads as a ${hint} but the cash moved the other way, so it was treated as a ${kind}`)
    }
  }

  // The description states the quantity exactly, while abs(amount) / price
  // only approximates it: DeGiro rounds the cash column, so 457,20 / 6,263 is
  // 73.0002 and a position summed from such residues never reads as closed.
  // The stated quantity therefore wins wherever the cash confirms it, and the
  // derived one is both the fallback and the check that keeps a misread - or
  // genuinely wrong - description from being trusted.
  const derived = price !== null && price > 0 && amount !== 0
    ? roundQuantity(Math.abs(amount) / price)
    : undefined

  const statedMatch = STATED_QUANTITY.exec(description)
  const readings = statedMatch ? statedQuantityReadings(statedMatch[1]) : []

  let quantity: number | undefined
  if (derived === undefined) {
    quantity = readings[0]
    warnings.push('Quantity could not be derived from the cash amount, so the description was trusted instead')
  } else {
    const stated = readings.find((reading) => agreesWithCash(reading, derived))
    quantity = stated ?? derived
    if (stated === undefined && readings.length > 0) {
      warnings.push(`Description says ${readings[0]} but the cash amount implies ${derived}`)
    }
  }

  return { kind, isin, price, quantity }
}

function parseRow(record: CsvRecord, seen: Map<string, number>): ParsedRow {
  const field = (index: number) => (record.fields[index] ?? '').trim()
  const warnings: string[] = []

  const time = field(COLUMN.time)
  const date = toTimestamp(field(COLUMN.date), time, warnings)
  const description = field(COLUMN.description)
  const product = field(COLUMN.product)
  const columnIsin = field(COLUMN.isin)
  const orderId = field(COLUMN.orderId) || undefined

  const amountText = field(COLUMN.changeAmount)
  const parsedAmount = parseDecimal(amountText)
  if (amountText && parsedAmount === null) {
    warnings.push(`Unreadable amount "${amountText}"`)
  }
  const amount = parsedAmount ?? 0

  // An internal transfer's counterpart row leaves Change blank and only states
  // a Balance, so the currency has to fall back to the balance column.
  const currency = field(COLUMN.changeCurrency) || field(COLUMN.balanceCurrency)

  // The currency is part of the identity because DeGiro posts the quarterly
  // interest notice once per currency, both for 0,00 - without it the EUR and
  // PLN halves of a pair sharing a minute would dedupe to one row. The Time
  // column is only HH:MM, so a statement can still repeat a row verbatim;
  // counting occurrences from the top of the file separates those, and stays
  // stable when a re-download appends older history below. Time is listed
  // separately as well, because a Date column the parser cannot read leaves
  // the timestamp without it.
  const identity = [date, time, columnIsin, description, currency, amount]
  const identityHash = hashParts(identity)
  const occurrence = (seen.get(identityHash) ?? 0) + 1
  seen.set(identityHash, occurrence)

  const base = {
    date,
    amount,
    currency,
    orderId,
    externalId: makeExternalId('degiro', [...identity, occurrence]),
    raw: record.raw,
    warnings,
  }

  const normalised = normalise(description)

  // Checked before anything else so the sweep's 'FLATEX EURO BANKACCOUNT' leg
  // can never be read as a holding.
  if (isInternal(normalised)) {
    return { ...base, kind: 'internal' }
  }

  const tail = TRADE_TAIL.exec(description)
  if (tail) {
    const trade = parseTradeRow(description, tail, amount, warnings)
    const declared = security(columnIsin, product)
    if (declared.isin && declared.isin !== trade.isin) {
      warnings.push(`ISIN column says ${declared.isin} but the description says ${trade.isin}`)
    }
    return {
      ...base,
      kind: trade.kind,
      // The description's own ISIN goes through the same cash-account refusal
      // as the column's, or the fallback would reintroduce what security() just
      // refused.
      isin: declared.isin ?? (isCashAccount(trade.isin) ? undefined : trade.isin),
      instrumentName: declared.instrumentName,
      quantity: trade.quantity,
      price: trade.price ?? undefined,
    }
  }

  if (FEE_HINTS.some((hint) => normalised.includes(hint))) {
    return { ...base, kind: 'fee', ...security(columnIsin, product) }
  }

  if (DEPOSIT_DESCRIPTIONS.includes(normalised)) {
    return { ...base, kind: amount < 0 ? 'withdrawal' : 'deposit' }
  }

  if (normalised.includes(INTEREST_HINT)) {
    return { ...base, kind: 'interest' }
  }

  warnings.push('No rule matched this description, so it was left unclassified')
  return { ...base, kind: 'unknown' }
}

export function parseDegiro(text: string): ParsedStatement {
  const records = parseCsv(stripBom(text))
  const warnings: string[] = []
  const rows: ParsedRow[] = []
  const currencies: string[] = []
  const seen = new Map<string, number>()

  let index = 0
  if (records.length > 0 && looksLikeHeader(records[0].fields)) {
    index = 1
  } else {
    warnings.push('No DeGiro header found; the file was read with the standard column order')
  }

  for (; index < records.length; index++) {
    const record = records[index]
    if (record.fields.every((value) => value.trim() === '')) continue

    const row = parseRow(record, seen)
    rows.push(row)
    if (row.currency && !currencies.includes(row.currency)) currencies.push(row.currency)
  }

  return { broker: 'degiro', rows, currencies, warnings }
}

export const degiroParser: StatementParser = {
  broker: 'degiro',
  detect: detectDegiro,
  parse: parseDegiro,
}
