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

  constructor(baseUrl: string = 'https://api.frankfurter.dev/v1') {
    this.baseUrl = baseUrl;
  }

  /**
   * Generate array of all dates between start and end (inclusive)
   */
  private getDateRange(start: Date, end: Date): Date[] {
    const dates: Date[] = [];
    const current = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
    const endDate = new Date(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()));

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
    const todayStr = this.formatDate(new Date());

    // Past dates with real data never expire
    if (dateStr < todayStr && hasRealData) {
      return null;
    }

    // For today or forward-filled past dates
    if (dateStr === todayStr) {
      const now = new Date();
      const nowCET = this.convertToCET(now);
      const cetHour = nowCET.getHours();

      // Before 16:00 CET: expire at 17:00 CET today
      if (cetHour < 16) {
        const expiration = new Date(now);
        const cetOffset = this.getCETOffset(now);
        expiration.setHours(17 - cetOffset, 0, 0, 0);
        return expiration.getTime();
      }

      // After 16:00 CET but no real data yet: expire in 1 hour
      if (!hasRealData) {
        return now.getTime() + 60 * 60 * 1000;
      }

      // After 16:00 with real data: never expires
      return null;
    }

    // Future dates: expire at 17:00 CET on that date
    const futureDate = new Date(date);
    const cetOffset = this.getCETOffset(futureDate);
    futureDate.setHours(17 - cetOffset, 0, 0, 0);
    return futureDate.getTime();
  }

  /**
   * Convert date to CET timezone
   */
  private convertToCET(date: Date): Date {
    const offset = this.getCETOffset(date);
    const utc = date.getTime() + date.getTimezoneOffset() * 60000;
    return new Date(utc + 3600000 * offset);
  }

  /**
   * Get CET offset (+1 or +2 depending on DST)
   */
  private getCETOffset(date: Date): number {
    // CET is UTC+1 in winter, UTC+2 in summer (CEST)
    // Simple approximation: last Sunday of March to last Sunday of October is CEST
    const year = date.getFullYear();
    const marchLast = new Date(year, 2, 31);
    marchLast.setDate(31 - marchLast.getDay());
    const octoberLast = new Date(year, 9, 31);
    octoberLast.setDate(31 - octoberLast.getDay());

    return date >= marchLast && date < octoberLast ? 2 : 1;
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
    fetchStartDate.setDate(fetchStartDate.getDate() - 7);

    const fetchStartDateStr = this.formatDate(fetchStartDate);
    const endDateStr = this.formatDate(endDate);
    const symbols = targetCurrencies.join(',');
    const url = `${this.baseUrl}/${fetchStartDateStr}..${endDateStr}?base=${baseCurrency}&symbols=${symbols}`;

    const response = await fetch(url);
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
