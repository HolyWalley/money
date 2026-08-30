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
   * Get exchange rates for base currency to multiple target currencies across a date range
   * Checks cache first - if all entries are cached and valid, returns from cache
   * Otherwise fetches fresh data from provider and merges it over the cached entries
   * If the provider fails, falls back to whatever was cached; only rethrows when
   * nothing at all was cached
   * The range is enumerated by UTC calendar day, matching the keys consumers look up
   * @returns Map with cache key (from:to:date) as key and rate as value
   */
  async getRates(
    baseCurrency: string,
    targetCurrencies: string[],
    startDate: Date,
    endDate: Date
  ): Promise<Map<string, number>> {
    // Generate all cache keys for the requested range
    const keys: string[] = [];
    const rangeStart = utcDayInstant(startDate);
    const rangeEnd = utcDayInstant(endDate);
    const current = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
    const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));

    while (current <= end) {
      const dateStr = this.formatDate(current);
      for (const currency of targetCurrencies) {
        keys.push(ExchangeRateService.createCacheKey(baseCurrency, currency, dateStr));
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }

    // Try to get all from cache in one go
    const cached = await this.cache.getMany(keys);

    // If we got everything from cache, return it
    if (cached.size === keys.length) {
      return cached;
    }

    // Otherwise, fetch fresh data from provider
    let rates: Map<string, ExchangeRateValue>;
    try {
      rates = await this.provider.getRates(baseCurrency, targetCurrencies, rangeStart, rangeEnd);
    } catch (error) {
      // A stale rate beats no rate: callers render financial totals, and a dropped
      // rate silently removes a transaction from them rather than flagging it.
      if (cached.size > 0) {
        return cached;
      }
      throw error;
    }

    // Store all in cache with expiration
    const cacheEntries = Array.from(rates.entries()).map((entry) => {
      const [key, rateValue] = entry;
      const [from, to, date] = this.parseCacheKey(key);
      return { from, to, date, rate: rateValue.rate, expiresAt: rateValue.expiresAt };
    });

    await this.cache.setMany(cacheEntries);

    // Fresh values win; cached values fill the gaps the provider did not return
    const ratesMap = new Map<string, number>(cached);
    for (const [key, rateValue] of rates.entries()) {
      ratesMap.set(key, rateValue.rate);
    }
    return ratesMap;
  }

  /**
   * Format date as YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
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

/**
 * Cache interface for storing and retrieving exchange rates
 */
export interface ExchangeRateCache {
  get(from: string, to: string, date: string): Promise<number | null>;
  getMany(keys: string[]): Promise<Map<string, number>>;
  set(from: string, to: string, date: string, rate: number, expiresAt: number | null): Promise<void>;
  setMany(
    rates: Array<{ from: string; to: string; date: string; rate: number; expiresAt: number | null }>
  ): Promise<void>;
}
