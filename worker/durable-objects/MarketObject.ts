import { DurableObject } from "cloudflare:workers";
import type { DateRange, FetchRange } from "../../shared/market-data";
import { mergeRanges, planPriceFetch, refreshableFrom, utcDateKey } from "../../shared/market-data";

export interface StoredClose {
  symbol: string;
  date: string;
  close: number;
  /**
   * Whether the provider's answer was a finished session's close - see
   * isSettledBar. Omitted means settled: only a bar we are told is provisional
   * gets to move once it is stored.
   */
  settled?: boolean;
}

export interface StoredInstrument {
  symbol: string;
  name: string;
  currency: string;
  exchange: string;
}

export interface SymbolFetchRange extends FetchRange {
  symbol: string;
}

/**
 * Examined ranges as they come back out of storage.
 *
 * The single span is what the first version of this object wrote. It is read
 * back as one range rather than ignored, so that upgrading does not throw away
 * everything already fetched - but nothing writes that shape any more, because
 * one span cannot tell "January and March were examined" from "January to March
 * was examined" and answered February as covered without ever fetching it.
 */
type StoredExamined = DateRange[] | { earliest: string; latest: string };

function examinedKey(symbol: string): string {
  return `examined:${symbol}`;
}

function normalizeExamined(stored: StoredExamined | undefined): DateRange[] {
  if (!stored) return [];
  if (Array.isArray(stored)) return stored;
  return [{ from: stored.earliest, to: stored.latest }];
}

/**
 * The one shared dataset in this app.
 *
 * Everything else a user owns is per-user CRDT state in MoneyObject. Closing
 * prices are public facts about a market, so they are stored once for everyone
 * and cost the provider one fetch instead of one per user. Nothing about
 * anybody's holdings is written here - only symbols and the prices the whole
 * world can look up. That is why it is addressed by a single fixed name rather
 * than by user id.
 *
 * Being shared is also why the coverage bookkeeping below is careful: a wrong
 * "already examined" here is not one user's missing chart, it is a window of
 * history that no user ever gets, with nothing that would ever heal it.
 */
export class MarketObject extends DurableObject {
  private storage: DurableObjectState['storage'];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS instruments (
        symbol TEXT PRIMARY KEY,
        name TEXT,
        currency TEXT,
        exchange TEXT,
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      )`
    );

    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS closes (
        symbol TEXT NOT NULL,
        date TEXT NOT NULL,
        close REAL NOT NULL,
        settled INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (symbol, date)
      )`
    );

    // `settled` arrived after the table shipped, and SQLite has no ADD COLUMN
    // IF NOT EXISTS: on every run but the one that migrates, this throws
    // "duplicate column name", which is the normal case rather than a fault.
    // Rows written before it default to settled, which is exactly what the code
    // that wrote them assumed.
    try {
      ctx.storage.sql.exec('ALTER TABLE closes ADD COLUMN settled INTEGER NOT NULL DEFAULT 1');
    } catch {
      // The column is already there.
    }

    this.storage = ctx.storage;
  }

  /**
   * What actually has to be asked of the provider to answer [from, to].
   *
   * The examined ranges per symbol are the input, never the days that happen to
   * have a close: see planPriceFetch for why holes inside one examined range
   * must not count as gaps, and why the ranges must not be collapsed into one.
   */
  async planFetch(symbols: string[], from: string, to: string, today?: string): Promise<SymbolFetchRange[]> {
    const asOf = today ?? utcDateKey(new Date());
    const examined = await this.storage.get<StoredExamined>(symbols.map(examinedKey));

    return symbols.flatMap((symbol) => {
      const ranges = normalizeExamined(examined.get(examinedKey(symbol)));
      return planPriceFetch(ranges, from, to, asOf, this.earliestUnsettled(symbol)).map((range) => ({
        symbol,
        ...range,
      }));
    });
  }

  /**
   * Records that the provider has already been asked about these ranges.
   *
   * Without this, a range the market has no sessions in - a request starting on
   * a Saturday, or before an ETF existed - looks like a gap for ever and is
   * refetched on every single request. Only call it for a fetch that actually
   * came back: marking a range examined after an outage would hide the hole.
   */
  async markExamined(ranges: SymbolFetchRange[]): Promise<void> {
    const bySymbol = new Map<string, DateRange[]>();

    for (const range of ranges) {
      const added = bySymbol.get(range.symbol) ?? [];
      added.push({ from: range.from, to: range.to });
      bySymbol.set(range.symbol, added);
    }

    for (const [symbol, added] of bySymbol) {
      const key = examinedKey(symbol);
      const current = normalizeExamined(await this.storage.get<StoredExamined>(key));
      await this.storage.put(key, mergeRanges([...current, ...added]));
    }
  }

  async getCloses(symbols: string[], from: string, to: string): Promise<StoredClose[]> {
    if (symbols.length === 0) {
      return [];
    }

    const placeholders = symbols.map(() => '?').join(',');
    const results = this.storage.sql.exec(
      `SELECT symbol, date, close, settled FROM closes
       WHERE symbol IN (${placeholders}) AND date >= ? AND date <= ?
       ORDER BY symbol, date`,
      ...symbols,
      from,
      to
    );

    return Array.from(results).map((row) => ({
      symbol: row.symbol as string,
      date: row.date as string,
      close: row.close as number,
      settled: row.settled !== 0,
    }));
  }

  /**
   * A close for a settled session is final, so a stored one is kept even if the
   * provider hands us a different number later. What may still move is a bar the
   * provider gave us mid-session (`settled: false`), however long ago that was,
   * and the tip - `mutableFrom` onwards - which covers rows written before
   * finality was recorded at all.
   */
  async putCloses(rows: StoredClose[], mutableFrom?: string): Promise<void> {
    const tip = mutableFrom ?? refreshableFrom(utcDateKey(new Date()));

    for (const row of rows) {
      this.storage.sql.exec(
        `INSERT INTO closes (symbol, date, close, settled) VALUES (?, ?, ?, ?)
         ON CONFLICT (symbol, date) DO UPDATE SET close = excluded.close, settled = excluded.settled
         WHERE closes.settled = 0 OR closes.date >= ?`,
        row.symbol,
        row.date,
        row.close,
        row.settled === false ? 0 : 1,
        tip
      );
    }
  }

  async getInstruments(symbols: string[]): Promise<StoredInstrument[]> {
    if (symbols.length === 0) {
      return [];
    }

    const placeholders = symbols.map(() => '?').join(',');
    const results = this.storage.sql.exec(
      `SELECT symbol, name, currency, exchange FROM instruments WHERE symbol IN (${placeholders})`,
      ...symbols
    );

    return Array.from(results).map((row) => ({
      symbol: row.symbol as string,
      name: (row.name as string | null) ?? '',
      currency: (row.currency as string | null) ?? '',
      exchange: (row.exchange as string | null) ?? '',
    }));
  }

  /**
   * Upserts what a source actually knows. An empty field means "this source
   * cannot say", never "this is now unknown": search hits carry a name and an
   * exchange but no currency, while the chart response carries the currency
   * and neither of the others, so a plain overwrite would have the two sources
   * erase each other.
   */
  async putInstruments(rows: StoredInstrument[]): Promise<void> {
    for (const row of rows) {
      this.storage.sql.exec(
        `INSERT INTO instruments (symbol, name, currency, exchange, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (symbol) DO UPDATE SET
           name = COALESCE(NULLIF(excluded.name, ''), instruments.name),
           currency = COALESCE(NULLIF(excluded.currency, ''), instruments.currency),
           exchange = COALESCE(NULLIF(excluded.exchange, ''), instruments.exchange),
           updated_at = excluded.updated_at`,
        row.symbol,
        row.name,
        row.currency,
        row.exchange,
        Date.now()
      );
    }
  }

  /** The oldest day still holding a price that was taken mid-session. */
  private earliestUnsettled(symbol: string): string | null {
    const results = this.storage.sql.exec(
      'SELECT MIN(date) AS date FROM closes WHERE symbol = ? AND settled = 0',
      symbol
    );

    const row = Array.from(results)[0];
    return (row?.date as string | null | undefined) ?? null;
  }
}
