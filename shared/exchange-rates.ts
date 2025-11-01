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
    const rateValue = await this.provider.getRate(from, to, date);

    // Store in cache with expiration
    await this.cache.set(from, to, dateStr, rateValue.rate, rateValue.expiresAt);

    return rateValue.rate;
  }

  /**
   * Get exchange rates for base currency to multiple target currencies across a date range
   * Checks cache first - if all entries are cached and valid, returns from cache
   * Otherwise fetches fresh data from provider
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
    const current = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()));
    const end = new Date(Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()));

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
    const rates = await this.provider.getRates(baseCurrency, targetCurrencies, startDate, endDate);

    // Store all in cache with expiration
    const cacheEntries = Array.from(rates.entries()).map((entry) => {
      const [key, rateValue] = entry;
      const [from, to, date] = this.parseCacheKey(key);
      return { from, to, date, rate: rateValue.rate, expiresAt: rateValue.expiresAt };
    });

    await this.cache.setMany(cacheEntries);

    // Return just the rates (without expiration info)
    const ratesMap = new Map<string, number>();
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
