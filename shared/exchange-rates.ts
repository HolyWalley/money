/**
 * Rates are keyed by the UTC calendar date of the instant they belong to, because that is
 * how consumers look them up (`new Date(transaction.date).toISOString().split('T')[0]`).
 * Providers derive their day keys from the *local* components of the dates they are handed,
 * so hand them an instant whose local and UTC calendar dates are both that UTC day. Without
 * this the two disagree by a day for any instant whose local and UTC dates differ, and the
 * range's boundary rate is never requested at all — the transaction then silently drops out
 * of the totals.
 */
function utcDayInstant(instant: Date): Date {
  const year = instant.getUTCFullYear();
  const month = instant.getUTCMonth();
  const day = instant.getUTCDate();
  const candidate = new Date(year, month, day);

  // East of UTC (and on a DST fall-back night) local midnight is still the previous UTC day;
  // step forward until both calendar dates agree. Bounded by the widest UTC offset, +14.
  for (let hour = 0; hour < 24; hour++) {
    if (
      candidate.getUTCFullYear() === year &&
      candidate.getUTCMonth() === month &&
      candidate.getUTCDate() === day
    ) {
      break;
    }
    candidate.setHours(candidate.getHours() + 1);
  }

  return candidate;
}

/**
 * How long a tombstone stands before the provider is asked about the currency again.
 * A currency it never publishes (GBp, say) would otherwise be re-requested on every read.
 */
export const TOMBSTONE_TTL_MS = 24 * 60 * 60 * 1000;

/** What the cache holds for a range: rows still valid, rows past their expiry, keys with no row. */
export interface RatesRead {
  rates: Map<string, number>;
  expired: Map<string, number>;
  missing: string[];
}

export interface RatesWithStatus {
  rates: Map<string, number>;
  /** False when the provider could not be reached: the rates are what the cache had. */
  complete: boolean;
}

/**
 * `next` over `previous`. The same Map back when `next` changes nothing, so a reader
 * memoized on the rates is not re-run by a refresh that confirmed what it had.
 */
export function mergeRates(previous: Map<string, number>, next: Map<string, number>): Map<string, number> {
  let changed = false;
  for (const [key, rate] of next) {
    if (previous.get(key) !== rate) {
      changed = true;
      break;
    }
  }
  return changed ? new Map([...previous, ...next]) : previous;
}

/**
 * Service for managing exchange rates with pluggable provider and cache
 */
export class ExchangeRateService {
  private provider: ExchangeRateProvider;
  private cache: ExchangeRateCache;

  constructor(provider: ExchangeRateProvider, cache: ExchangeRateCache) {
    this.provider = provider;
    this.cache = cache;
  }

  /**
   * Get exchange rate for a specific date
   * Checks cache first, falls back to provider
   */
  async getRate(from: string, to: string, date: Date): Promise<number> {
    const dateStr = this.formatDate(date);

    // Try cache first
    const cached = await this.cache.get(from, to, dateStr);
    if (cached !== null) {
      return cached;
    }

    // Fetch from provider
    const rateValue = await this.provider.getRate(from, to, utcDayInstant(date));

    // Store in cache with expiration
    await this.cache.set(from, to, dateStr, rateValue.rate, rateValue.expiresAt);

    return rateValue.rate;
  }

  /**
   * What the cache holds for the base currency against the targets across the range,
   * expired rows included: a stale rate is still the rate a total would show while a
   * fresh one is fetched. Never asks the provider.
   */
  async readRates(
    baseCurrency: string,
    targetCurrencies: string[],
    startDate: Date,
    endDate: Date
  ): Promise<RatesRead> {
    const keys = this.keysFor(baseCurrency, targetCurrencies, startDate, endDate);
    const { fresh, expired } = await this.cache.getManyWithExpiry(keys);
    const missing = keys.filter((key) => !fresh.has(key) && !expired.has(key));
    return { rates: fresh, expired, missing };
  }

  /**
   * Get exchange rates for base currency to multiple target currencies across a date range
   * Checks cache first - if all entries are cached and valid, returns from cache
   * Otherwise fetches the gap from the provider and merges it over the cached entries
   * If the provider fails, falls back to whatever was cached, expired rows included
   * The range is enumerated by UTC calendar day, matching the keys consumers look up
   * @returns Map with cache key (from:to:date) as key and rate as value
   */
  async getRates(
    baseCurrency: string,
    targetCurrencies: string[],
    startDate: Date,
    endDate: Date
  ): Promise<Map<string, number>> {
    const { rates } = await this.getRatesWithStatus(baseCurrency, targetCurrencies, startDate, endDate);
    return rates;
  }

  /** `getRates`, also saying whether the provider answered. */
  async getRatesWithStatus(
    baseCurrency: string,
    targetCurrencies: string[],
    startDate: Date,
    endDate: Date
  ): Promise<RatesWithStatus> {
    const { rates, expired, missing } = await this.readRates(baseCurrency, targetCurrencies, startDate, endDate);
    const gaps = [...expired.keys(), ...missing];

    // Everything cached and valid: the Map as read, so equal reads compare equal
    if (gaps.length === 0) {
      return { rates, complete: true };
    }

    // Ask for the gap alone, not the range: a four-year cache missing yesterday and
    // today is two days of traffic, and only for the currencies with a hole
    const gapDays = gaps.map((key) => this.parseCacheKey(key)[2]).sort();
    const gapCurrencies = new Set(gaps.map((key) => this.parseCacheKey(key)[1]));
    const currencies = targetCurrencies.filter((currency) => gapCurrencies.has(currency));

    // Never later than today, however far ahead the gap starts: a window lying
    // wholly after the last published day is a 404, which reads as an outage
    // and leaves a planned transaction unconverted. Reaching back to today lets
    // the provider forward-fill the days to come from the latest rate.
    const today = this.formatDate(new Date());
    const rangeStart = utcDayInstant(this.dayInstant(gapDays[0] < today ? gapDays[0] : today));
    const rangeEnd = utcDayInstant(this.dayInstant(gapDays[gapDays.length - 1]));

    const cached = mergeRates(rates, expired);
    let fresh: Map<string, ExchangeRateValue>;
    try {
      fresh = await this.provider.getRates(baseCurrency, currencies, rangeStart, rangeEnd);
    } catch {
      // A stale rate beats no rate: callers render financial totals, and a dropped
      // rate silently removes a transaction from them rather than flagging it.
      return { rates: cached, complete: false };
    }

    const cacheEntries = Array.from(fresh.entries()).map(([key, rateValue]) => {
      const [from, to, date] = this.parseCacheKey(key);
      return { from, to, date, rate: rateValue.rate, expiresAt: rateValue.expiresAt };
    });

    // A currency the answer leaves out entirely is one the provider does not publish.
    // A tombstone (rate 0, which `findRate` skips) keeps it from being asked for on
    // every read, and counts as a row so nothing waits on it.
    const answered = new Set(cacheEntries.map((entry) => entry.to));
    const tombstoneExpiresAt = Date.now() + TOMBSTONE_TTL_MS;
    for (const key of gaps) {
      const [from, to, date] = this.parseCacheKey(key);
      if (!answered.has(to)) {
        cacheEntries.push({ from, to, date, rate: 0, expiresAt: tombstoneExpiresAt });
      }
    }

    await this.cache.setMany(cacheEntries);

    // Fresh values win; cached values fill the gaps the provider did not return
    const ratesMap = new Map<string, number>(cached);
    for (const { from, to, date, rate } of cacheEntries) {
      ratesMap.set(ExchangeRateService.createCacheKey(from, to, date), rate);
    }
    return { rates: ratesMap, complete: true };
  }

  /**
   * Every cache key of the range, day-major, enumerated by UTC calendar day
   */
  private keysFor(
    baseCurrency: string,
    targetCurrencies: string[],
    startDate: Date,
    endDate: Date
  ): string[] {
    const keys: string[] = [];
    const current = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
    const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));

    while (current <= end) {
      const dateStr = this.formatDate(current);
      for (const currency of targetCurrencies) {
        keys.push(ExchangeRateService.createCacheKey(baseCurrency, currency, dateStr));
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return keys;
  }

  /**
   * Format date as YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * The instant a YYYY-MM-DD day key starts, in UTC
   */
  private dayInstant(day: string): Date {
    return new Date(`${day}T00:00:00.000Z`);
  }

  /**
   * Parse cache key back to components
   * Expected format: "USD:EUR:2024-01-15"
   */
  private parseCacheKey(key: string): [string, string, string] {
    const [from, to, date] = key.split(':');
    return [from, to, date];
  }

  /**
   * Create cache key from components
   */
  static createCacheKey(from: string, to: string, date: string): string {
    return `${from}:${to}:${date}`;
  }
}

export interface ExchangeRateValue {
  rate: number;
  expiresAt: number | null;
}

/**
 * Provider interface for fetching exchange rates from external sources
 */
export interface ExchangeRateProvider {
  /**
   * Get a single exchange rate for a specific date
   */
  getRate(from: string, to: string, date: Date): Promise<ExchangeRateValue>;

  /**
   * Get exchange rates from base currency to multiple target currencies across a date range
   * @returns Map with cache key (from:to:date) as key and rate/expiration info as value
   */
  getRates(
    baseCurrency: string,
    targetCurrencies: string[],
    startDate: Date,
    endDate: Date
  ): Promise<Map<string, ExchangeRateValue>>;
}

/** Cached rows split by whether their expiry has passed */
export interface CachedRates {
  fresh: Map<string, number>;
  expired: Map<string, number>;
}

/**
 * Cache interface for storing and retrieving exchange rates
 */
export interface ExchangeRateCache {
  get(from: string, to: string, date: string): Promise<number | null>;
  /** Valid rows only */
  getMany(keys: string[]): Promise<Map<string, number>>;
  /** Every row, expired ones told apart */
  getManyWithExpiry(keys: string[]): Promise<CachedRates>;
  set(from: string, to: string, date: string, rate: number, expiresAt: number | null): Promise<void>;
  setMany(
    rates: Array<{ from: string; to: string; date: string; rate: number; expiresAt: number | null }>
  ): Promise<void>;
}
