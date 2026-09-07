import type { ExchangeRateProvider, ExchangeRateValue } from './exchange-rates';
import { ExchangeRateService } from './exchange-rates';

interface FrankfurterTimeSeriesResponse {
  amount: number;
  base: string;
  start_date: string;
  end_date: string;
  rates: Record<string, Record<string, number>>;
}

export class FrankfurterExchangeRateProvider implements ExchangeRateProvider {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(baseUrl: string = 'https://api.frankfurter.dev/v1', timeoutMs: number = 8000) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Generate array of all dates between start and end (inclusive)
   */
  private getDateRange(start: Date, end: Date): Date[] {
    // UTC components, because formatDate() derives every emitted key from
    // toISOString(). Reading local components here made the enumerated days and the
    // key strings disagree by one in any non-UTC zone.
    const dates: Date[] = [];
    const current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const endDate = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));

    while (current <= endDate) {
      dates.push(new Date(current));
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return dates;
  }

  /**
   * Calculate expiration time for a given date
   * - Past dates: null (never expires)
   * - Today before 16:00 CET: 17:00 CET today
   * - Today after 16:00 CET: now + 1 hour
   * - Future dates: 17:00 CET on that date
   */
  private getExpirationForDate(date: Date, hasRealData: boolean): number | null {
    const dateStr = this.formatDate(date);
    const now = new Date();
    const todayStr = this.formatDate(now);

    // Past dates never expire, regardless of whether they're forward-filled
    if (dateStr < todayStr) {
      return null;
    }

    // For today
    if (dateStr === todayStr) {
      const publishedAt = this.publicationInstant(now);

      // Before 16:00 CET: expire at 17:00 CET today
      if (now.getTime() < publishedAt - 60 * 60 * 1000) {
        return publishedAt;
      }

      // After 16:00 CET but no real data yet: expire in 1 hour
      if (!hasRealData) {
        return now.getTime() + 60 * 60 * 1000;
      }

      // After 16:00 with real data: never expires
      return null;
    }

    // Future dates: expire at 17:00 CET on that date
    return this.publicationInstant(date);
  }

  /**
   * 17:00 CET on the UTC day of `date`, as an instant.
   *
   * From the UTC components rather than setHours, which sets the LOCAL hour:
   * that instant was right only for a browser running in UTC. In Warsaw's
   * summer it came out at 15:00 local, so a row written between 15:00 and
   * 16:00 was expired the moment it was stored, and every read in that hour
   * went back to the provider.
   */
  private publicationInstant(date: Date): number {
    const cetOffset = this.getCETOffset(date);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 17 - cetOffset, 0, 0, 0);
  }

  /**
   * Get CET offset (+1 or +2 depending on DST)
   */
  private getCETOffset(date: Date): number {
    // CET is UTC+1 in winter, UTC+2 in summer (CEST): from the last Sunday of
    // March to the last Sunday of October, switching at 01:00 UTC. In UTC
    // terms throughout, so the answer is the same in every zone.
    const year = date.getUTCFullYear();
    const lastSundayAtOne = (month: number) => {
      const day = new Date(Date.UTC(year, month, 31, 1));
      day.setUTCDate(31 - day.getUTCDay());
      return day.getTime();
    };

    const time = date.getTime();
    return time >= lastSundayAtOne(2) && time < lastSundayAtOne(9) ? 2 : 1;
  }

  async getRate(from: string, to: string, date: Date): Promise<ExchangeRateValue> {
    // Use getRates for single date to leverage forward-fill logic
    const rates = await this.getRates(from, [to], date, date);
    const key = ExchangeRateService.createCacheKey(from, to, this.formatDate(date));
    const rateValue = rates.get(key);

    if (!rateValue) {
      throw new Error(`Exchange rate not found for ${from} to ${to} on ${this.formatDate(date)}`);
    }

    return rateValue;
  }

  async getRates(
    baseCurrency: string,
    targetCurrencies: string[],
    startDate: Date,
    endDate: Date
  ): Promise<Map<string, ExchangeRateValue>> {
    // Fetch extra 7 days backwards to ensure we have a seed rate for forward-filling
    // This handles cases where the start date falls on a weekend/holiday
    const fetchStartDate = new Date(startDate);
    fetchStartDate.setUTCDate(fetchStartDate.getUTCDate() - 7);

    const fetchStartDateStr = this.formatDate(fetchStartDate);
    const endDateStr = this.formatDate(endDate);
    const symbols = targetCurrencies.join(',');
    const url = `${this.baseUrl}/${fetchStartDateStr}..${endDateStr}?base=${baseCurrency}&symbols=${symbols}`;

    const response = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });

    // 404 is how Frankfurter says it publishes none of the currencies or days
    // asked for - a currency it does not carry at all, say - never that it is
    // down. An answer with nothing in it, so the caller can record that and
    // stop asking, rather than a failure it retries every thirty seconds.
    if (response.status === 404) {
      return new Map();
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch exchange rates: ${response.statusText}`);
    }

    const data: FrankfurterTimeSeriesResponse = await response.json();

    // Create a map of what API returned (date -> currency -> rate)
    const apiRates = new Map<string, Map<string, number>>();
    for (const [date, rates] of Object.entries(data.rates)) {
      const currencyRates = new Map<string, number>();
      for (const [currency, rate] of Object.entries(rates)) {
        currencyRates.set(currency, rate);
      }
      apiRates.set(date, currencyRates);
    }

    // Track last known rate for each currency for forward-filling
    const lastKnownRates = new Map<string, number>();

    // First pass: Process lookback period (7 days before start) to populate seed rates
    // Process up to the day before startDate to avoid duplicating work
    const dayBeforeStart = new Date(startDate);
    dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);

    if (dayBeforeStart >= fetchStartDate) {
      const lookbackDates = this.getDateRange(fetchStartDate, dayBeforeStart);
      for (const date of lookbackDates) {
        const dateStr = this.formatDate(date);
        const apiData = apiRates.get(dateStr);

        if (apiData) {
          for (const currency of targetCurrencies) {
            if (apiData.has(currency)) {
              lastKnownRates.set(currency, apiData.get(currency)!);
            }
          }
        }
      }
    }

    // Second pass: Process requested date range and build result
    const requestedDates = this.getDateRange(startDate, endDate);
    const result = new Map<string, ExchangeRateValue>();

    for (const date of requestedDates) {
      const dateStr = this.formatDate(date);
      const apiData = apiRates.get(dateStr);

      for (const currency of targetCurrencies) {
        let rate: number;
        let hasRealData: boolean;

        if (apiData?.has(currency)) {
          // We have real data from API
          rate = apiData.get(currency)!;
          lastKnownRates.set(currency, rate);
          hasRealData = true;
        } else {
          // No data from API - forward-fill from last known
          const lastRate = lastKnownRates.get(currency);
          if (lastRate === undefined) {
            // No previous rate to forward-fill from, skip this currency
            continue;
          }
          rate = lastRate;
          hasRealData = false;
        }

        const key = ExchangeRateService.createCacheKey(baseCurrency, currency, dateStr);
        const expiresAt = this.getExpirationForDate(date, hasRealData);

        result.set(key, { rate, expiresAt });
      }
    }

    return result;
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
