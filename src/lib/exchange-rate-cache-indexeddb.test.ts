import { describe, it, expect, beforeEach } from 'vitest';
import { IndexedDBExchangeRateCache } from './exchange-rate-cache-indexeddb';
import { db } from './db-dexie';

describe('IndexedDBExchangeRateCache', () => {
  let cache: IndexedDBExchangeRateCache;

  beforeEach(async () => {
    cache = new IndexedDBExchangeRateCache();
    await db.exchangeRates.clear();
  });

  describe('get', () => {
    it('should return null for non-existent rate', async () => {
      const rate = await cache.get('USD', 'EUR', '2024-01-15');
      expect(rate).toBeNull();
    });

    it('should return cached rate if exists', async () => {
      await cache.set('USD', 'EUR', '2024-01-15', 1.25, null);
      const rate = await cache.get('USD', 'EUR', '2024-01-15');
      expect(rate).toBe(1.25);
    });

    it('should return null for expired rate', async () => {
      const expiredTime = Date.now() - 1000; // 1 second ago
      await cache.set('USD', 'EUR', '2024-01-15', 1.25, expiredTime);
      const rate = await cache.get('USD', 'EUR', '2024-01-15');
      expect(rate).toBeNull();
    });

    it('should return rate if not yet expired', async () => {
      const futureTime = Date.now() + 60000; // 1 minute from now
      await cache.set('USD', 'EUR', '2024-01-15', 1.25, futureTime);
      const rate = await cache.get('USD', 'EUR', '2024-01-15');
      expect(rate).toBe(1.25);
    });

    it('should handle different currency pairs independently', async () => {
      await cache.set('USD', 'EUR', '2024-01-15', 1.25, null);
      await cache.set('USD', 'GBP', '2024-01-15', 0.85, null);

      const eurRate = await cache.get('USD', 'EUR', '2024-01-15');
      const gbpRate = await cache.get('USD', 'GBP', '2024-01-15');

      expect(eurRate).toBe(1.25);
      expect(gbpRate).toBe(0.85);
    });

    it('should handle different dates independently', async () => {
      await cache.set('USD', 'EUR', '2024-01-15', 1.25, null);
      await cache.set('USD', 'EUR', '2024-01-16', 1.26, null);

      const rate15 = await cache.get('USD', 'EUR', '2024-01-15');
      const rate16 = await cache.get('USD', 'EUR', '2024-01-16');

      expect(rate15).toBe(1.25);
      expect(rate16).toBe(1.26);
    });
  });

  describe('getMany', () => {
    it('should return empty map for empty keys', async () => {
      const rates = await cache.getMany([]);
      expect(rates.size).toBe(0);
    });

    it('should return rates for existing keys', async () => {
      await cache.setMany([
        { from: 'USD', to: 'EUR', date: '2024-01-15', rate: 1.25, expiresAt: null },
        { from: 'USD', to: 'GBP', date: '2024-01-15', rate: 0.85, expiresAt: null },
        { from: 'USD', to: 'EUR', date: '2024-01-16', rate: 1.26, expiresAt: null },
      ]);

      const rates = await cache.getMany([
        'USD:EUR:2024-01-15',
        'USD:GBP:2024-01-15',
        'USD:EUR:2024-01-16',
      ]);

      expect(rates.size).toBe(3);
      expect(rates.get('USD:EUR:2024-01-15')).toBe(1.25);
      expect(rates.get('USD:GBP:2024-01-15')).toBe(0.85);
      expect(rates.get('USD:EUR:2024-01-16')).toBe(1.26);
    });

    it('should skip non-existent keys', async () => {
      await cache.set('USD', 'EUR', '2024-01-15', 1.25, null);

      const rates = await cache.getMany([
        'USD:EUR:2024-01-15',
        'USD:GBP:2024-01-15', // doesn't exist
      ]);

      expect(rates.size).toBe(1);
      expect(rates.get('USD:EUR:2024-01-15')).toBe(1.25);
      expect(rates.has('USD:GBP:2024-01-15')).toBe(false);
    });

    it('should skip expired keys', async () => {
      const expiredTime = Date.now() - 1000;
      const futureTime = Date.now() + 60000;

      await cache.setMany([
        { from: 'USD', to: 'EUR', date: '2024-01-15', rate: 1.25, expiresAt: expiredTime },
        { from: 'USD', to: 'GBP', date: '2024-01-15', rate: 0.85, expiresAt: futureTime },
      ]);

      const rates = await cache.getMany([
        'USD:EUR:2024-01-15',
        'USD:GBP:2024-01-15',
      ]);

      expect(rates.size).toBe(1);
      expect(rates.has('USD:EUR:2024-01-15')).toBe(false); // expired
      expect(rates.get('USD:GBP:2024-01-15')).toBe(0.85);
    });

    it('should handle mixed existing, non-existing, and expired keys', async () => {
      const expiredTime = Date.now() - 1000;

      await cache.setMany([
        { from: 'USD', to: 'EUR', date: '2024-01-15', rate: 1.25, expiresAt: null },
        { from: 'USD', to: 'GBP', date: '2024-01-15', rate: 0.85, expiresAt: expiredTime },
      ]);

      const rates = await cache.getMany([
        'USD:EUR:2024-01-15', // exists
        'USD:GBP:2024-01-15', // expired
        'USD:JPY:2024-01-15', // doesn't exist
      ]);

      expect(rates.size).toBe(1);
      expect(rates.get('USD:EUR:2024-01-15')).toBe(1.25);
    });
  });

  describe('set', () => {
    it('should store rate in cache', async () => {
      await cache.set('USD', 'EUR', '2024-01-15', 1.25, null);

      const record = await db.exchangeRates.get('USD:EUR:2024-01-15');
      expect(record).toEqual({
        key: 'USD:EUR:2024-01-15',
        from: 'USD',
        to: 'EUR',
        date: '2024-01-15',
        rate: 1.25,
        expiresAt: null,
      });
    });

    it('should update existing rate', async () => {
      await cache.set('USD', 'EUR', '2024-01-15', 1.25, null);
      await cache.set('USD', 'EUR', '2024-01-15', 1.30, null);

      const rate = await cache.get('USD', 'EUR', '2024-01-15');
      expect(rate).toBe(1.30);
    });
  });

  describe('setMany', () => {
    it('should store multiple rates in cache', async () => {
      await cache.setMany([
        { from: 'USD', to: 'EUR', date: '2024-01-15', rate: 1.25, expiresAt: null },
        { from: 'USD', to: 'GBP', date: '2024-01-15', rate: 0.85, expiresAt: null },
        { from: 'USD', to: 'EUR', date: '2024-01-16', rate: 1.26, expiresAt: null },
      ]);

      const rate1 = await cache.get('USD', 'EUR', '2024-01-15');
      const rate2 = await cache.get('USD', 'GBP', '2024-01-15');
      const rate3 = await cache.get('USD', 'EUR', '2024-01-16');

      expect(rate1).toBe(1.25);
      expect(rate2).toBe(0.85);
      expect(rate3).toBe(1.26);
    });

    it('should handle empty array', async () => {
      await cache.setMany([]);
      const count = await db.exchangeRates.count();
      expect(count).toBe(0);
    });

    it('should update existing rates in batch', async () => {
      await cache.setMany([
        { from: 'USD', to: 'EUR', date: '2024-01-15', rate: 1.25, expiresAt: null },
        { from: 'USD', to: 'GBP', date: '2024-01-15', rate: 0.85, expiresAt: null },
      ]);

      await cache.setMany([
        { from: 'USD', to: 'EUR', date: '2024-01-15', rate: 1.30, expiresAt: null },
        { from: 'USD', to: 'JPY', date: '2024-01-15', rate: 150.0, expiresAt: null },
      ]);

      const eurRate = await cache.get('USD', 'EUR', '2024-01-15');
      const gbpRate = await cache.get('USD', 'GBP', '2024-01-15');
      const jpyRate = await cache.get('USD', 'JPY', '2024-01-15');

      expect(eurRate).toBe(1.30);
      expect(gbpRate).toBe(0.85);
      expect(jpyRate).toBe(150.0);
    });
  });
});
