import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExchangeRateService } from './exchange-rates';
import type { ExchangeRateProvider, ExchangeRateCache } from './exchange-rates';
import { FrankfurterExchangeRateProvider } from './exchange-rate-provider-frankfurter';

const utcDay = (date: Date): string => date.toISOString().split('T')[0];

describe('ExchangeRateService', () => {
  let mockProvider: ExchangeRateProvider;
  let mockCache: ExchangeRateCache;
  let service: ExchangeRateService;

  /**
   * The provider is handed normalised day instants rather than the caller's raw ones, so
   * assert the UTC day it was asked for. Pinning the exact Date objects is what let the
   * local-vs-UTC key mismatch stay invisible.
   */
  const expectProviderDayRange = (start: string, end: string) => {
    const call = vi.mocked(mockProvider.getRates).mock.calls[0];
    expect(utcDay(call[2])).toBe(start);
    expect(utcDay(call[3])).toBe(end);
  };

  beforeEach(() => {
    mockProvider = {
      getRate: vi.fn(),
      getRates: vi.fn(),
    };

    mockCache = {
      get: vi.fn(),
      getMany: vi.fn(),
      set: vi.fn(),
      setMany: vi.fn(),
    };

    service = new ExchangeRateService(mockProvider, mockCache);
  });

  describe('getRate', () => {
    it('should return cached rate if available', async () => {
      const date = new Date('2024-01-15');
      vi.mocked(mockCache.get).mockResolvedValue(1.25);

      const rate = await service.getRate('USD', 'EUR', date);

      expect(rate).toBe(1.25);
      expect(mockCache.get).toHaveBeenCalledWith('USD', 'EUR', '2024-01-15');
      expect(mockProvider.getRate).not.toHaveBeenCalled();
    });

    it('should fetch from provider and cache if not in cache', async () => {
      const date = new Date('2024-01-15');
      vi.mocked(mockCache.get).mockResolvedValue(null);
      vi.mocked(mockProvider.getRate).mockResolvedValue({ rate: 1.25, expiresAt: null });

      const rate = await service.getRate('USD', 'EUR', date);

      expect(rate).toBe(1.25);
      expect(mockCache.get).toHaveBeenCalledWith('USD', 'EUR', '2024-01-15');
      expect(utcDay(vi.mocked(mockProvider.getRate).mock.calls[0][2])).toBe('2024-01-15');
      expect(mockCache.set).toHaveBeenCalledWith('USD', 'EUR', '2024-01-15', 1.25, null);
    });

    it('should handle dates with time correctly', async () => {
      const date = new Date('2024-01-15T14:30:00Z');
      vi.mocked(mockCache.get).mockResolvedValue(null);
      vi.mocked(mockProvider.getRate).mockResolvedValue({ rate: 1.25, expiresAt: null });

      await service.getRate('USD', 'EUR', date);

      expect(mockCache.get).toHaveBeenCalledWith('USD', 'EUR', '2024-01-15');
      expect(mockCache.set).toHaveBeenCalledWith('USD', 'EUR', '2024-01-15', 1.25, null);
    });

    it('should store expiration time from provider', async () => {
      const date = new Date('2024-01-15');
      const expiresAt = Date.now() + 60000;
      vi.mocked(mockCache.get).mockResolvedValue(null);
      vi.mocked(mockProvider.getRate).mockResolvedValue({ rate: 1.25, expiresAt });

      await service.getRate('USD', 'EUR', date);

      expect(mockCache.set).toHaveBeenCalledWith('USD', 'EUR', '2024-01-15', 1.25, expiresAt);
    });
  });

  describe('getRates', () => {
    it('should return from cache if all rates are cached', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-02');
      const cachedRates = new Map([
        ['USD:EUR:2024-01-01', 1.25],
        ['USD:EUR:2024-01-02', 1.26],
        ['USD:GBP:2024-01-01', 0.85],
        ['USD:GBP:2024-01-02', 0.86],
      ]);

      vi.mocked(mockCache.getMany).mockResolvedValue(cachedRates);

      const result = await service.getRates('USD', ['EUR', 'GBP'], startDate, endDate);

      expect(result).toBe(cachedRates);
      expect(mockCache.getMany).toHaveBeenCalled();
      expect(mockProvider.getRates).not.toHaveBeenCalled();
    });

    it('should fetch from provider if cache is incomplete', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-02');
      const partialCache = new Map([
        ['USD:EUR:2024-01-01', 1.25],
        // Missing other entries
      ]);
      const providerRates = new Map([
        ['USD:EUR:2024-01-01', { rate: 1.25, expiresAt: null }],
        ['USD:EUR:2024-01-02', { rate: 1.26, expiresAt: null }],
        ['USD:GBP:2024-01-01', { rate: 0.85, expiresAt: null }],
        ['USD:GBP:2024-01-02', { rate: 0.86, expiresAt: null }],
      ]);

      vi.mocked(mockCache.getMany).mockResolvedValue(partialCache);
      vi.mocked(mockProvider.getRates).mockResolvedValue(providerRates);

      const result = await service.getRates('USD', ['EUR', 'GBP'], startDate, endDate);

      expect(mockProvider.getRates).toHaveBeenCalledWith(
        'USD',
        ['EUR', 'GBP'],
        expect.any(Date),
        expect.any(Date)
      );
      expectProviderDayRange('2024-01-01', '2024-01-02');
      expect(mockCache.setMany).toHaveBeenCalledWith([
        { from: 'USD', to: 'EUR', date: '2024-01-01', rate: 1.25, expiresAt: null },
        { from: 'USD', to: 'EUR', date: '2024-01-02', rate: 1.26, expiresAt: null },
        { from: 'USD', to: 'GBP', date: '2024-01-01', rate: 0.85, expiresAt: null },
        { from: 'USD', to: 'GBP', date: '2024-01-02', rate: 0.86, expiresAt: null },
      ]);
      expect(result.size).toBe(4);
    });

    it('should fetch from provider if nothing is cached', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-02');
      const providerRates = new Map([
        ['USD:EUR:2024-01-01', { rate: 1.25, expiresAt: null }],
        ['USD:EUR:2024-01-02', { rate: 1.26, expiresAt: null }],
      ]);

      vi.mocked(mockCache.getMany).mockResolvedValue(new Map());
      vi.mocked(mockProvider.getRates).mockResolvedValue(providerRates);

      await service.getRates('USD', ['EUR'], startDate, endDate);

      expectProviderDayRange('2024-01-01', '2024-01-02');
    });

    it('should handle single target currency', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-02');
      const providerRates = new Map([
        ['USD:EUR:2024-01-01', { rate: 1.25, expiresAt: null }],
        ['USD:EUR:2024-01-02', { rate: 1.26, expiresAt: null }],
      ]);

      vi.mocked(mockCache.getMany).mockResolvedValue(new Map());
      vi.mocked(mockProvider.getRates).mockResolvedValue(providerRates);

      const result = await service.getRates('USD', ['EUR'], startDate, endDate);

      expect(result.size).toBe(2);
      expectProviderDayRange('2024-01-01', '2024-01-02');
    });

    it('should merge fresh provider rates over the cached ones', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-02');
      const partialCache = new Map([
        ['USD:EUR:2024-01-01', 1.00],
        ['USD:GBP:2024-01-01', 0.80],
        ['USD:GBP:2024-01-02', 0.81],
      ]);
      // Provider answers with a narrower range than requested
      const providerRates = new Map([
        ['USD:EUR:2024-01-01', { rate: 1.25, expiresAt: null }],
        ['USD:EUR:2024-01-02', { rate: 1.26, expiresAt: null }],
      ]);

      vi.mocked(mockCache.getMany).mockResolvedValue(partialCache);
      vi.mocked(mockProvider.getRates).mockResolvedValue(providerRates);

      const result = await service.getRates('USD', ['EUR', 'GBP'], startDate, endDate);

      expect(result).toEqual(
        new Map([
          ['USD:EUR:2024-01-01', 1.25],
          ['USD:GBP:2024-01-01', 0.80],
          ['USD:GBP:2024-01-02', 0.81],
          ['USD:EUR:2024-01-02', 1.26],
        ])
      );
    });

    it('should still cache the fresh entries when merging', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-02');
      const partialCache = new Map([['USD:EUR:2024-01-01', 1.00]]);
      const providerRates = new Map([
        ['USD:EUR:2024-01-02', { rate: 1.26, expiresAt: 1234 }],
      ]);

      vi.mocked(mockCache.getMany).mockResolvedValue(partialCache);
      vi.mocked(mockProvider.getRates).mockResolvedValue(providerRates);

      await service.getRates('USD', ['EUR'], startDate, endDate);

      expect(mockCache.setMany).toHaveBeenCalledWith([
        { from: 'USD', to: 'EUR', date: '2024-01-02', rate: 1.26, expiresAt: 1234 },
      ]);
    });

    it('should fall back to the partial cache when the provider fails', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-02');
      const partialCache = new Map([
        ['USD:EUR:2024-01-01', 1.25],
        ['USD:EUR:2024-01-02', 1.26],
        ['USD:GBP:2024-01-01', 0.85],
      ]);

      vi.mocked(mockCache.getMany).mockResolvedValue(partialCache);
      vi.mocked(mockProvider.getRates).mockRejectedValue(new Error('Network request failed'));

      const result = await service.getRates('USD', ['EUR', 'GBP'], startDate, endDate);

      expect(result).toEqual(
        new Map([
          ['USD:EUR:2024-01-01', 1.25],
          ['USD:EUR:2024-01-02', 1.26],
          ['USD:GBP:2024-01-01', 0.85],
        ])
      );
    });

    it('should not write to the cache when the provider fails', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-02');

      vi.mocked(mockCache.getMany).mockResolvedValue(new Map([['USD:EUR:2024-01-01', 1.25]]));
      vi.mocked(mockProvider.getRates).mockRejectedValue(new Error('Network request failed'));

      await service.getRates('USD', ['EUR'], startDate, endDate);

      expect(mockCache.setMany).not.toHaveBeenCalled();
    });

    it('should reject if the provider fails and nothing was cached', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-02');
      const providerError = new Error('Network request failed');

      vi.mocked(mockCache.getMany).mockResolvedValue(new Map());
      vi.mocked(mockProvider.getRates).mockRejectedValue(providerError);

      await expect(service.getRates('USD', ['EUR'], startDate, endDate)).rejects.toBe(
        providerError
      );
      expect(mockCache.setMany).not.toHaveBeenCalled();
    });

    it('should handle empty results', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const mockRates = new Map();

      vi.mocked(mockCache.getMany).mockResolvedValue(new Map());
      vi.mocked(mockProvider.getRates).mockResolvedValue(mockRates);

      const result = await service.getRates('USD', ['EUR'], startDate, endDate);

      expect(result.size).toBe(0);
      expect(mockCache.setMany).toHaveBeenCalledWith([]);
    });
  });

  describe('createCacheKey', () => {
    it('should create correctly formatted cache key', () => {
      const key = ExchangeRateService.createCacheKey('USD', 'EUR', '2024-01-15');
      expect(key).toBe('USD:EUR:2024-01-15');
    });
  });
});

/**
 * Consumers look a rate up by the UTC calendar date of the transaction instant
 * (`new Date(transaction.date).toISOString().split('T')[0]` in useDecoratedTransactions).
 * These cases pin the runtime timezone so they fail on any machine if the range is ever
 * enumerated from local components again: the boundary transaction's key would then fall
 * outside the fetched range and the transaction would silently drop out of every total.
 */
describe('ExchangeRateService UTC date keys across timezones', () => {
  const originalTz = process.env.TZ;

  const cases = [
    {
      tz: 'Europe/Warsaw',
      // 00:30 local on Jan 16, but the UTC day — and so the lookup key — is Jan 15
      instants: [
        '2024-01-15T23:30:00.000Z',
        '2024-01-17T09:00:00.000Z',
        '2024-01-20T10:00:00.000Z',
      ],
    },
    {
      tz: 'America/New_York',
      // 21:30 local on Jan 20, but the UTC day — and so the lookup key — is Jan 21
      instants: [
        '2024-01-15T12:00:00.000Z',
        '2024-01-17T09:00:00.000Z',
        '2024-01-21T02:30:00.000Z',
      ],
    },
  ];

  const lookupKey = (instant: string): string =>
    ExchangeRateService.createCacheKey('USD', 'EUR', new Date(instant).toISOString().split('T')[0]);

  const emptyCache = (): ExchangeRateCache => ({
    get: vi.fn(),
    getMany: vi.fn().mockResolvedValue(new Map()),
    set: vi.fn(),
    setMany: vi.fn(),
  });

  afterEach(() => {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
    vi.restoreAllMocks();
  });

  it.each(cases)('requests every transaction key in $tz', async ({ tz, instants }) => {
    process.env.TZ = tz;

    const provider: ExchangeRateProvider = {
      getRate: vi.fn(),
      getRates: vi.fn().mockResolvedValue(new Map()),
    };
    const cache = emptyCache();
    const service = new ExchangeRateService(provider, cache);

    await service.getRates(
      'USD',
      ['EUR'],
      new Date(instants[0]),
      new Date(instants[instants.length - 1])
    );

    const requestedKeys = vi.mocked(cache.getMany).mock.calls[0][0];
    for (const instant of instants) {
      expect(requestedKeys).toContain(lookupKey(instant));
    }
  });

  it.each(cases)('resolves every transaction lookup in $tz end to end', async ({ tz, instants }) => {
    process.env.TZ = tz;

    // Serves a rate for every UTC day the provider actually asks for, so a missing key can
    // only mean the requested range did not cover it.
    const fetchMock = vi.fn(async (url: string) => {
      const range = /\/(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})\?/.exec(String(url));
      if (!range) throw new Error(`unexpected url: ${url}`);
      const rates: Record<string, Record<string, number>> = {};
      const day = new Date(`${range[1]}T00:00:00.000Z`);
      const last = new Date(`${range[2]}T00:00:00.000Z`);
      while (day <= last) {
        rates[day.toISOString().split('T')[0]] = { EUR: 0.9 };
        day.setUTCDate(day.getUTCDate() + 1);
      }
      return {
        ok: true,
        json: async () => ({
          amount: 1,
          base: 'USD',
          start_date: range[1],
          end_date: range[2],
          rates,
        }),
      };
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new ExchangeRateService(new FrankfurterExchangeRateProvider(), emptyCache());

    const dates = instants.map(instant => new Date(instant));
    const start = dates.reduce((min, date) => (date < min ? date : min));
    const end = dates.reduce((max, date) => (date > max ? date : max));

    const rates = await service.getRates('USD', ['EUR'], start, end);

    for (const instant of instants) {
      expect(rates.get(lookupKey(instant))).toBe(0.9);
    }
  });
});
