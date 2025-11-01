import type { ExchangeRateCache } from '../../shared/exchange-rates';
import { ExchangeRateService } from '../../shared/exchange-rates';
import { db } from './db-dexie';

export class IndexedDBExchangeRateCache implements ExchangeRateCache {
  async get(from: string, to: string, date: string): Promise<number | null> {
    const key = ExchangeRateService.createCacheKey(from, to, date);
    const record = await db.exchangeRates.get(key);

    if (!record) {
      return null;
    }

    if (record.expiresAt !== null && Date.now() > record.expiresAt) {
      return null;
    }

    return record.rate;
  }

  async getMany(keys: string[]): Promise<Map<string, number>> {
    const records = await db.exchangeRates.bulkGet(keys);
    const result = new Map<string, number>();
    const now = Date.now();

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (record && (record.expiresAt === null || now <= record.expiresAt)) {
        result.set(keys[i], record.rate);
      }
    }

    return result;
  }

  async set(from: string, to: string, date: string, rate: number, expiresAt: number | null): Promise<void> {
    const key = ExchangeRateService.createCacheKey(from, to, date);
    await db.exchangeRates.put({
      key,
      from,
      to,
      date,
      rate,
      expiresAt,
    });
  }

  async setMany(
    rates: Array<{ from: string; to: string; date: string; rate: number; expiresAt: number | null }>
  ): Promise<void> {
    const records = rates.map(({ from, to, date, rate, expiresAt }) => ({
      key: ExchangeRateService.createCacheKey(from, to, date),
      from,
      to,
      date,
      rate,
      expiresAt,
    }));

    await db.exchangeRates.bulkPut(records);
  }
}
