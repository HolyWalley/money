export type BrokerId = 'degiro' | 'revolut'

/**
 * What a source row does to the account.
 *
 * 'internal' is broker plumbing that shuffles money between the user's own
 * sub-accounts - DeGiro's cash sweep to the flatex bank account, Revolut's
 * migration between its trading entities. It is parsed and returned rather
 * than dropped so the preview can say "48 rows excluded as internal
 * transfers" instead of quietly losing them; it must never be imported.
 *
 * 'deposit' and 'withdrawal' are money crossing the broker boundary. They are
 * excluded from import by default: the user already records those as ordinary
 * transfers in their own ledger, so importing them double-counts.
 */
export type ParsedRowKind =
  | 'buy' | 'sell' | 'dividend' | 'fee' | 'interest'
  | 'deposit' | 'withdrawal' | 'internal' | 'unknown'

export interface ParsedRow {
  kind: ParsedRowKind
  date: string            // ISO 8601
  isin?: string
  ticker?: string
  instrumentName?: string
  quantity?: number
  price?: number
  /**
   * What the statement itself called this row: DeGiro's description column,
   * Revolut's type.
   *
   * Kept because the kind a row is filed under is a category, not a name, and
   * the two are not the same thing. A promotional rebate is income to a ledger
   * and is imported as interest, which is right - but a list that shows it as
   * "Interest" beside eighteen quarterly notices has thrown away the only word
   * that told them apart.
   */
  description?: string
  amount: number          // signed cash effect, in currency
  currency: string
  fee?: number
  orderId?: string
  externalId: string      // stable across re-imports of an overlapping statement
  raw: string             // the original CSV line, shown in the import preview
  warnings: string[]
}

/** What the broker itself says the account held, once its last row had posted. */
export interface StatedBalance {
  currency: string
  amount: number
}

export interface ParsedStatement {
  broker: BrokerId
  rows: ParsedRow[]       // EVERY source row, including 'internal' ones
  currencies: string[]
  warnings: string[]
  /**
   * The closing balance the statement states, where it states one.
   *
   * Worth carrying because summing the rows only gives the same answer for an
   * export that reaches back to the account's first day. A statement filtered
   * to one year sums to that year's change, and a reconciliation that treats
   * the sum as the balance is then wrong by everything that came before -
   * which matters most exactly when it is used to set an opening balance.
   *
   * Empty where the format states no balance at all, as Revolut's does not.
   */
  statedBalances: StatedBalance[]
}

export interface StatementParser {
  broker: BrokerId
  detect(text: string): boolean
  parse(text: string): ParsedStatement
}

const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193

function fnv1a(input: string, seed: number): number {
  let hash = seed
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME)
  }
  return hash >>> 0
}

/**
 * 64 bits of FNV-1a over the joined parts, as 16 hex characters.
 *
 * Deliberately synchronous and dependency-free: parsing is synchronous, so
 * crypto.subtle's promise-returning digest cannot be used here. Two passes
 * with different seeds widen the 32-bit hash enough that a few thousand
 * statement rows collide with negligible probability.
 */
export function hashParts(parts: ReadonlyArray<string | number | null | undefined>): string {
  // Joined on a control character no CSV field carries, so ['a', 'bc'] cannot
  // hash the same as ['ab', 'c'].
  const joined = parts.map((part) => (part === null || part === undefined ? '' : String(part))).join('\u001f')
  const high = fnv1a(joined, FNV_OFFSET)
  const low = fnv1a(joined, FNV_OFFSET ^ 0x5bf03635)
  return high.toString(16).padStart(8, '0') + low.toString(16).padStart(8, '0')
}

/**
 * The dedupe key for one source row.
 *
 * It cannot be the broker's order id: a single DeGiro order legitimately
 * produces several rows - two partial fills plus a fee all share order id
 * baecbc31-ecb1-4d0b-ba8b-0dd910aa295b - so the id must come from the row's
 * own identifying content. Pass enough fields to separate sibling rows
 * (timestamp, description, signed amount, quantity), and, where a statement
 * really can repeat a row verbatim, its 1-based occurrence index among the
 * identical ones. Never pass the row's position in the file: a re-download
 * with more history shifts every index.
 */
export function makeExternalId(
  broker: BrokerId,
  parts: ReadonlyArray<string | number | null | undefined>
): string {
  return `${broker}:${hashParts(parts)}`
}
