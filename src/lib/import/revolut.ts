import {
  makeExternalId,
  type ParsedRow,
  type ParsedRowKind,
  type ParsedStatement,
  type StatementParser,
} from './types'

const DATE_COLUMN = 'date'
const TICKER_COLUMN = 'ticker'
const TYPE_COLUMN = 'type'
const QUANTITY_COLUMN = 'quantity'
const PRICE_COLUMN = 'price per share'
const TOTAL_COLUMN = 'total amount'
const CURRENCY_COLUMN = 'currency'

// Revolut has added columns to this export over the years, so every column is
// looked up by name and a file that carries more of them still parses.
const REQUIRED_COLUMNS = [DATE_COLUMN, TYPE_COLUMN, TOTAL_COLUMN]

/**
 * What identifies the export as Revolut's, rather than what parse() needs.
 *
 * detect() may not be stricter than the parser: an export with one column more
 * than the version this was written against reads perfectly, so insisting on
 * an exact header would reject a file that imports fine. These four names in
 * any order, extras tolerated, are distinctive enough that no other broker's
 * export answers to them.
 */
const DETECT_COLUMNS = [TICKER_COLUMN, TYPE_COLUMN, PRICE_COLUMN, TOTAL_COLUMN]

/**
 * How far quantity x price may sit from the stated total before it is worth a
 * warning.
 *
 * Revolut derives 'Price per share' by rounding total / quantity to two
 * decimals, so quantity x price only ever approximates the total - out by up
 * to half a cent per share, plus the total's own rounding. Anything wider is a
 * real spread the broker kept, and the statement's total, not the product, is
 * what actually moved.
 */
const PRICE_ROUNDING_PER_SHARE = 0.005
const TOTAL_ROUNDING = 0.01

const ZERO_TOLERANCE = 1e-9

/**
 * How the numeric parts of an externalId are written before they are hashed.
 *
 * The id has to survive a change of formatting in a later export. This one
 * file already writes both 'USD 25' and 'USD 81.71', so hashing the field text
 * would give every row a new id the day Revolut starts writing 'USD 25.00',
 * and a re-import of an overlapping period would duplicate the whole history -
 * exactly what the id exists to prevent. Fixed decimal places make 25 and
 * 25.00 the same string; quantities keep the eight places Revolut states
 * fractional shares to.
 */
const ID_QUANTITY_PLACES = 8
const ID_AMOUNT_PLACES = 4

const MONEY_PATTERN = /^(-)?\s*(?:([A-Za-z]{3})\s+)?(-)?\s*([\d,]+(?:\.\d+)?)$/
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const ZONE_PATTERN = /(?:Z|[+-]\d{2}:?\d{2})$/i

interface Money {
  amount: number
  currency?: string
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (quoted) {
      if (char !== '"') {
        field += char
      } else if (line[i + 1] === '"') {
        field += '"'
        i++
      } else {
        quoted = false
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      fields.push(field)
      field = ''
    } else {
      field += char
    }
  }

  fields.push(field)
  return fields
}

function stripBom(line: string): string {
  return line.replace(/^\ufeff/, '')
}

function buildColumnIndex(headerLine: string): Map<string, number> {
  const columns = new Map<string, number>()

  splitCsvLine(stripBom(headerLine)).forEach((name, position) => {
    const key = name.trim().toLowerCase()
    // First wins, so a duplicated header name cannot shadow the real column.
    if (key && !columns.has(key)) {
      columns.set(key, position)
    }
  })

  return columns
}

function readField(fields: string[], columns: Map<string, number>, name: string): string {
  const position = columns.get(name)
  if (position === undefined) return ''
  return (fields[position] ?? '').trim()
}

/**
 * 'USD 332.29' -> 332.29 in USD. The amount columns carry a currency code the
 * number cannot be parsed through, and the code is worth keeping to check it
 * against the statement's own Currency column.
 */
function parseMoney(field: string): Money | null {
  if (!field) return null

  const match = MONEY_PATTERN.exec(field)
  if (!match) return null

  const [, leadingSign, currency, innerSign, digits] = match
  const value = Number(digits.replace(/,/g, ''))
  if (!Number.isFinite(value)) return null

  return {
    amount: leadingSign || innerSign ? -value : value,
    currency: currency ? currency.toUpperCase() : undefined,
  }
}

/**
 * Revolut states every timestamp in UTC. One that reaches us without its Z -
 * an export a spreadsheet has round-tripped - would otherwise be read in the
 * machine's own timezone, moving the instant by hours and the calendar day
 * with it, so the stated zone is restored rather than inferred.
 */
function toInstant(raw: string): Date {
  if (!TIMESTAMP_PATTERN.test(raw)) return new Date(NaN)
  return new Date(ZONE_PATTERN.test(raw) ? raw : `${raw}Z`)
}

function parseQuantity(field: string): number | null {
  if (!field) return null

  const value = Number(field.replace(/,/g, ''))
  return Number.isFinite(value) ? value : null
}

/**
 * The Type strings Revolut is known to write, matched by prefix rather than by
 * equality: it spells out the order type ('BUY - MARKET', 'BUY - LIMIT') and
 * the full legal-entity names of a transfer's two ends.
 */
const KNOWN_TYPES: ReadonlyArray<readonly [string, ParsedRowKind]> = [
  ['TRANSFER', 'internal'],
  ['BUY', 'buy'],
  ['SELL', 'sell'],
  ['DIVIDEND', 'dividend'],
  ['CASH TOP-UP', 'deposit'],
  ['CASH WITHDRAWAL', 'withdrawal'],
]

/**
 * Words that carry a cash direction wherever they sit inside a Type.
 *
 * Revolut bills custody and other fees under spellings this parser has not
 * seen, and every one of them takes money out; a Type that says withdrawal is
 * one whatever precedes the word. Guessing the exact strings would be
 * inventing them, so the word is matched as a substring and the row still
 * carries a warning naming the Type verbatim for the user to check.
 */
const TYPE_HINTS: ReadonlyArray<readonly [string, ParsedRowKind]> = [
  ['FEE', 'fee'],
  ['WITHDRAW', 'withdrawal'],
]

interface Classification {
  kind: ParsedRowKind
  /** The word an unfamiliar Type was matched on, absent for a known spelling. */
  hint?: string
}

function classify(type: string): Classification {
  for (const [prefix, kind] of KNOWN_TYPES) {
    if (type.startsWith(prefix)) return { kind }
  }
  for (const [hint, kind] of TYPE_HINTS) {
    if (type.includes(hint)) return { kind, hint }
  }
  return { kind: 'unknown' }
}

/**
 * A position migration between Revolut's legal entities, recognised by shape
 * rather than by its Type string.
 *
 * 'TRANSFER FROM REVOLUT TRADING LTD TO REVOLUT SECURITIES EUROPE UAB' carries
 * a real quantity with no price and a zero total. Read as "it has a quantity,
 * so it is a trade" it doubles the position and halves its cost basis, so the
 * shape is checked even when the Type says otherwise.
 */
function isPositionMigration(quantity: number | null, price: number | null, total: number): boolean {
  return quantity !== null && Math.abs(quantity) > ZERO_TOLERANCE
    && price === null
    && Math.abs(total) < ZERO_TOLERANCE
}

function signedAmount(kind: ParsedRowKind, amount: number): number {
  const magnitude = Math.abs(amount)

  switch (kind) {
    case 'buy':
    case 'fee':
    case 'withdrawal':
      return -magnitude
    case 'sell':
    case 'dividend':
    case 'deposit':
    case 'interest':
      return magnitude
    // Revolut writes every amount unsigned, so an unrecognised Type states no
    // direction at all and picking one would be a guess worth twice the row: a
    // custody fee booked as income moves a preview's balance the wrong way by
    // 2x its value. The row is kept, with no cash effect for anything summing
    // a balance; its magnitude stays visible in the warning and the raw line.
    case 'unknown':
      return 0
    // 'internal' shuffles money between the user's own accounts and is never
    // imported, so the statement's own sign is left as it is.
    default:
      return amount
  }
}

function detect(text: string): boolean {
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue

    const columns = buildColumnIndex(line)
    return DETECT_COLUMNS.every((name) => columns.has(name))
  }
  return false
}

/**
 * A statement that could not be read at all, reported the way an unreadable
 * row is: parse() never throws, so a UI that lets the user pick the broker
 * shows the warning instead of crashing on an uncaught error.
 */
function unreadable(warning: string): ParsedStatement {
  return { broker: 'revolut', rows: [], currencies: [], warnings: [warning] }
}

function parse(text: string): ParsedStatement {
  const lines = text.split(/\r?\n/)
  const headerIndex = lines.findIndex((line) => line.trim() !== '')

  if (headerIndex === -1) {
    return unreadable('The file is empty, so no rows were read')
  }

  const columns = buildColumnIndex(lines[headerIndex])
  const missing = REQUIRED_COLUMNS.filter((name) => !columns.has(name))
  if (missing.length > 0) {
    return unreadable(`This is not a Revolut statement: it has no ${missing.join(', ')} column(s), so no rows were read`)
  }

  const columnCount = splitCsvLine(stripBom(lines[headerIndex])).length
  const rows: ParsedRow[] = []
  const currencies: string[] = []
  const warnings: string[] = []
  const seenIds = new Set<string>()

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue

    const fields = splitCsvLine(line)
    const rowWarnings: string[] = []

    if (fields.length !== columnCount) {
      rowWarnings.push(`Row has ${fields.length} fields, expected ${columnCount}`)
    }

    const rawDate = readField(fields, columns, DATE_COLUMN)
    const rawType = readField(fields, columns, TYPE_COLUMN)
    const rawQuantity = readField(fields, columns, QUANTITY_COLUMN)
    const rawTotal = readField(fields, columns, TOTAL_COLUMN)
    const ticker = readField(fields, columns, TICKER_COLUMN)

    // Revolut timestamps carry microseconds, which a Date truncates away. Only
    // the externalId needs that precision, and it hashes the raw string.
    const timestamp = toInstant(rawDate)
    const parsedDate = Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString()
    if (parsedDate === null) {
      rowWarnings.push('Unrecognised date; the row cannot be placed in time')
    }
    const date = parsedDate ?? rawDate

    const total = parseMoney(rawTotal)
    if (total === null) {
      rowWarnings.push(`Unrecognised amount "${rawTotal}"`)
    }

    const statedPrice = parseMoney(readField(fields, columns, PRICE_COLUMN))
    const price = statedPrice === null ? null : statedPrice.amount
    const quantity = parseQuantity(rawQuantity)
    const amount = total?.amount ?? 0

    const classification = classify(rawType.toUpperCase())
    let kind = classification.kind
    // Only a trade is worth overriding. A row of this shape that is neither a
    // buy nor a sell - a split, a merger - is left 'unknown' so it is reviewed
    // rather than quietly excluded as plumbing.
    if ((kind === 'buy' || kind === 'sell') && isPositionMigration(quantity, price, amount)) {
      kind = 'internal'
      rowWarnings.push('Quantity with no price and a zero total: treated as an internal position migration, not a trade')
    }

    const statedCurrency = readField(fields, columns, CURRENCY_COLUMN).toUpperCase()
    // The Currency column is the authority; the code prefixing the amount is a
    // cross-check, and a disagreement means one of them is about to be wrong.
    const currency = statedCurrency || total?.currency || ''
    if (statedCurrency && total?.currency && statedCurrency !== total.currency) {
      rowWarnings.push(`Currency column says ${statedCurrency} but the amount is stated in ${total.currency}`)
    }
    if (!currency) {
      rowWarnings.push('Row states no currency')
    } else if (!currencies.includes(currency)) {
      currencies.push(currency)
    }

    if ((kind === 'buy' || kind === 'sell') && quantity !== null && price !== null) {
      const tolerance = Math.abs(quantity) * PRICE_ROUNDING_PER_SHARE + TOTAL_ROUNDING
      const implied = quantity * price
      if (Math.abs(implied - Math.abs(amount)) > tolerance) {
        // Reported, never corrected: the total is what actually left or
        // reached the account, whatever the price column implies.
        rowWarnings.push(`Total ${Math.abs(amount)} differs from quantity x price ${implied.toFixed(2)}`)
      }
    }

    if (classification.hint) {
      rowWarnings.push(`Unfamiliar type "${rawType}"; matched on "${classification.hint}" and treated as a ${kind}`)
    } else if (kind === 'unknown') {
      rowWarnings.push(
        Math.abs(amount) > ZERO_TOLERANCE
          ? `Unrecognised type "${rawType}"; its stated ${rawTotal} is left out of the cash balance`
          : `Unrecognised type "${rawType}"`
      )
    }

    const externalId = makeExternalId('revolut', [
      // The date stays raw: its microseconds are what separate two rows posted
      // in the same second, and they are the one thing no reformatting of the
      // numbers can touch.
      rawDate,
      ticker.toUpperCase(),
      rawType.toUpperCase(),
      (quantity ?? 0).toFixed(ID_QUANTITY_PLACES),
      total === null ? rawTotal : total.amount.toFixed(ID_AMOUNT_PLACES),
      // The amount is hashed as a bare number, so the code the field states it
      // in has to be carried separately: without it 'USD 25' and 'EUR 25' are
      // the same row, and one of the two is deduped away on import.
      currency,
    ])
    if (seenIds.has(externalId)) {
      rowWarnings.push('Identical to an earlier row in this statement; it will be imported once')
    }
    seenIds.add(externalId)

    rows.push({
      kind,
      date,
      ticker: ticker || undefined,
      quantity: quantity ?? 0,
      price: price ?? undefined,
      amount: signedAmount(kind, amount),
      currency,
      fee: 0,
      externalId,
      raw: line,
      warnings: rowWarnings,
    })
  }

  if (rows.length === 0) {
    warnings.push('Statement contains no rows')
  }

  return { broker: 'revolut', rows, currencies, warnings }
}

/**
 * Revolut Trading's CSV export.
 *
 * Oldest row first, quantities fractional to 8 decimal places and
 * authoritative, no ISIN and no commission anywhere. The Total Amount column,
 * not quantity x price, is what moved cash - and because that column is
 * unsigned, direction comes from the Type alone, which is why a Type the
 * parser cannot map yields a row with no cash effect rather than a guess.
 */
export const revolutParser: StatementParser = {
  broker: 'revolut',
  detect,
  parse,
}
