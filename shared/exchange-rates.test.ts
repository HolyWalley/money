import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UTCDate } from '@date-fns/utc';
import { ExchangeRateService, TOMBSTONE_TTL_MS, mergeRates } from './exchange-rates';
import type {
  CachedRates,
  ExchangeRateProvider,
  ExchangeRateCache,
  ExchangeRateValue,
} from './exchange-rates';
import { FrankfurterExchangeRateProvider } from './exchange-rate-provider-frankfurter';

const utcDay = (date: Date): string => date.toISOString().split('T')[0];

const rows = (entries: Record<string, number>): Map<string, number> => new Map(Object.entries(entries));

const cached = (fresh: Record<string, number>, expired: Record<string, number> = {}): CachedRates => ({
  fresh: rows(fresh),
  expired: rows(expired),
});

const published = (entries: Record<string, number>): Map<string, ExchangeRateValue> =>
  new Map(Object.entries(entries).map(([key, rate]) => [key, { rate, expiresAt: null }]));

/** Every day from `from` to `to` inclusive, as YYYY-MM-DD. */
function days(from: string, to: string): string[] {
  const list: string[] = [];
  const cursor = new UTCDate(`${from}T00:00:00.000Z`);
  const end = new UTCDate(`${to}T00:00:00.000Z`);
  while (cursor <= end) {
    list.push(utcDay(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return list;
}

/**
 * A cache that remembers what it is handed, so a second read sees the first
 * call's writes: what the tombstone case is about.
 */
function memoryCache(): ExchangeRateCache {
  const store = new Map<string, { rate: number; expiresAt: number | null }>();
  const getManyWithExpiry = async (keys: string[]): Promise<CachedRates> => {
    const fresh = new Map<string, number>();
    const expired = new Map<string, number>();
    for (const key of keys) {
      const row = store.get(key);
      if (!row) continue;
      const valid = row.expiresAt === null || Date.now() <= row.expiresAt;
      (valid ? fresh : expired).set(key, row.rate);
    }
    return { fresh, expired };
  };
  return {
    get: vi.fn(),
    getMany: vi.fn(async (keys: string[]) => (await getManyWithExpiry(keys)).fresh),
    getManyWithExpiry: vi.fn(getManyWithExpiry),
    set: vi.fn(),
    setMany: vi.fn(async (entries) => {
      for (const { from, to, date, rate, expiresAt } of entries) {
        store.set(ExchangeRateService.createCacheKey(from, to, date), { rate, expiresAt });
      }
    }),
  };
}

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
      getManyWithExpiry: vi.fn(),
      set: vi.fn(),
      setMany: vi.fn(),
    };

    service = new ExchangeRateService(mockProvider, mockCache);
  });

  afterEach(() => {
    vi.useRealTimers();
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

  describe('readRates', () => {
    it('reports what is fresh, what is expired and what has no row at all', async () => {
      vi.mocked(mockCache.getManyWithExpiry).mockResolvedValue(
        cached(
          { 'USD:EUR:2024-01-01': 1.25, 'USD:GBP:2024-01-01': 0.85 },
          { 'USD:EUR:2024-01-02': 1.26 }
        )
      );

      const read = await service.readRates('USD', ['EUR', 'GBP'], new Date('2024-01-01'), new Date('2024-01-02'));

      expect(mockCache.getManyWithExpiry).toHaveBeenCalledWith([
        'USD:EUR:2024-01-01',
        'USD:GBP:2024-01-01',
        'USD:EUR:2024-01-02',
        'USD:GBP:2024-01-02',
      ]);
      expect(read.rates).toEqual(rows({ 'USD:EUR:2024-01-01': 1.25, 'USD:GBP:2024-01-01': 0.85 }));
      expect(read.expired).toEqual(rows({ 'USD:EUR:2024-01-02': 1.26 }));
      expect(read.missing).toEqual(['USD:GBP:2024-01-02']);
      expect(mockProvider.getRates).not.toHaveBeenCalled();
    });
  });

  describe('getRates', () => {
    it('should return from cache if all rates are cached', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-02');
      const cachedRates = rows({
        'USD:EUR:2024-01-01': 1.25,
        'USD:EUR:2024-01-02': 1.26,
        'USD:GBP:2024-01-01': 0.85,
        'USD:GBP:2024-01-02': 0.86,
      });

      vi.mocked(mockCache.getManyWithExpiry).mockResolvedValue({ fresh: cachedRates, expired: new Map() });

      const result = await service.getRates('USD', ['EUR', 'GBP'], startDate, endDate);

      expect(result).toBe(cachedRates);
      expect(mockCache.getManyWithExpiry).toHaveBeenCalled();
      expect(mockProvider.getRates).not.toHaveBeenCalled();
    });

    it('should fetch from provider if cache is incomplete', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-02');
      const providerRates = published({
        'USD:EUR:2024-01-01': 1.25,
        'USD:EUR:2024-01-02': 1.26,
        'USD:GBP:2024-01-01': 0.85,
        'USD:GBP:2024-01-02': 0.86,
      });

      vi.mocked(mockCache.getManyWithExpiry).mockResolvedValue(cached({ 'USD:EUR:2024-01-01': 1.25 }));
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

      vi.mocked(mockCache.getManyWithExpiry).mockResolvedValue(cached({}));
      vi.mocked(mockProvider.getRates).mockResolvedValue(
        published({ 'USD:EUR:2024-01-01': 1.25, 'USD:EUR:2024-01-02': 1.26 })
      );

      const result = await service.getRates('USD', ['EUR'], startDate, endDate);

      expect(result.size).toBe(2);
      expectProviderDayRange('2024-01-01', '2024-01-02');
    });

    it('asks only for the days and the currencies with a gap, in the order the caller gave', async () => {
      vi.mocked(mockCache.getManyWithExpiry).mockImplementation(async (keys) => {
        const fresh = new Map<string, number>();
        const expired = new Map<string, number>();
        for (const key of keys) {
          if (key === 'USD:GBP:2024-01-05') expired.set(key, 0.8);
          else if (key !== 'USD:EUR:2024-01-03' && key !== 'USD:GBP:2024-01-07') fresh.set(key, 1);
        }
        return { fresh, expired };
      });
      vi.mocked(mockProvider.getRates).mockResolvedValue(new Map());

      await service.getRates('USD', ['PLN', 'GBP', 'EUR'], new Date('2024-01-01'), new Date('2024-01-10'));

      expect(mockProvider.getRates).toHaveBeenCalledWith('USD', ['GBP', 'EUR'], expect.any(Date), expect.any(Date));
      expectProviderDayRange('2024-01-03', '2024-01-07');
    });

    it('asks for two days when a four-year cache lacks yesterday and today', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new UTCDate('2026-09-08T10:00:00Z'));
      const start = new UTCDate('2022-09-08T00:00:00Z');
      const today = new UTCDate('2026-09-08T00:00:00Z');
      const fresh = new Map(
        days('2022-09-08', '2026-09-06').map((day) => [ExchangeRateService.createCacheKey('USD', 'EUR', day), 1])
      );
      vi.mocked(mockCache.getManyWithExpiry).mockResolvedValue({ fresh, expired: new Map() });
      vi.mocked(mockProvider.getRates).mockResolvedValue(new Map());

      await service.getRates('USD', ['EUR'], start, today);

      expect(mockProvider.getRates).toHaveBeenCalledTimes(1);
      expectProviderDayRange('2026-09-07', '2026-09-08');
    });

    // A window lying wholly after the last published day is a 404, which reads
    // as an outage: the days to come stay unconverted and the gap is re-asked
    // for every half minute. Starting at today, the provider's own lookback
    // reaches a published rate and forward-fills from it.
    it('asks from today when every gap day is still to come', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new UTCDate('2026-09-08T10:00:00Z'));
      const fresh = new Map(
        days('2022-09-08', '2026-09-15').map((day) => [ExchangeRateService.createCacheKey('USD', 'EUR', day), 1])
      );
      // A planned transaction eight days out, on a day nothing was cached for.
      for (const day of days('2026-09-16', '2026-09-16')) {
        fresh.delete(ExchangeRateService.createCacheKey('USD', 'EUR', day));
      }
      vi.mocked(mockCache.getManyWithExpiry).mockResolvedValue({ fresh, expired: new Map() });
      vi.mocked(mockProvider.getRates).mockResolvedValue(new Map());

      await service.getRates('USD', ['EUR'], new UTCDate('2022-09-08T00:00:00Z'), new UTCDate('2026-09-16T00:00:00Z'));

      expectProviderDayRange('2026-09-08', '2026-09-16');
    });

    it('should merge fresh provider rates over the cached ones', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-02');
      // Only EUR on the 2nd is missing; the provider answers more than it was asked
      // for, and what it answers wins
      vi.mocked(mockCache.getManyWithExpiry).mockResolvedValue(
        cached({ 'USD:EUR:2024-01-01': 1.0, 'USD:GBP:2024-01-01': 0.8, 'USD:GBP:2024-01-02': 0.81 })
      );
      vi.mocked(mockProvider.getRates).mockResolvedValue(
        published({ 'USD:EUR:2024-01-01': 1.25, 'USD:EUR:2024-01-02': 1.26 })
      );

      const result = await service.getRates('USD', ['EUR', 'GBP'], startDate, endDate);

      expect(mockProvider.getRates).toHaveBeenCalledWith('USD', ['EUR'], expect.any(Date), expect.any(Date));
      expectProviderDayRange('2024-01-02', '2024-01-02');
      expect(result).toEqual(
        rows({
          'USD:EUR:2024-01-01': 1.25,
          'USD:GBP:2024-01-01': 0.8,
          'USD:GBP:2024-01-02': 0.81,
          'USD:EUR:2024-01-02': 1.26,
        })
      );
    });

    it('should still cache the fresh entries when merging', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-02');

      vi.mocked(mockCache.getManyWithExpiry).mockResolvedValue(cached({ 'USD:EUR:2024-01-01': 1.0 }));
      vi.mocked(mockProvider.getRates).mockResolvedValue(
        new Map([['USD:EUR:2024-01-02', { rate: 1.26, expiresAt: 1234 }]])
      );

      await service.getRates('USD', ['EUR'], startDate, endDate);

      expect(mockCache.setMany).toHaveBeenCalledWith([
        { from: 'USD', to: 'EUR', date: '2024-01-02', rate: 1.26, expiresAt: 1234 },
      ]);
    });

    it('refreshes an expired row and lets the fresh value win', async () => {
      vi.mocked(mockCache.getManyWithExpiry).mockResolvedValue(
        cached({ 'USD:EUR:2024-01-01': 1.25 }, { 'USD:EUR:2024-01-02': 1.2 })
      );
      vi.mocked(mockProvider.getRates).mockResolvedValue(published({ 'USD:EUR:2024-01-02': 1.26 }));

      const result = await service.getRates('USD', ['EUR'], new Date('2024-01-01'), new Date('2024-01-02'));

      expectProviderDayRange('2024-01-02', '2024-01-02');
      expect(result).toEqual(rows({ 'USD:EUR:2024-01-01': 1.25, 'USD:EUR:2024-01-02': 1.26 }));
    });

    it('should fall back to the cache, expired rows included, when the provider fails', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-02');

      vi.mocked(mockCache.getManyWithExpiry).mockResolvedValue(
        cached(
          { 'USD:EUR:2024-01-01': 1.25, 'USD:EUR:2024-01-02': 1.26 },
          { 'USD:GBP:2024-01-01': 0.85 }
        )
      );
      vi.mocked(mockProvider.getRates).mockRejectedValue(new Error('Network request failed'));

      const result = await service.getRatesWithStatus('USD', ['EUR', 'GBP'], startDate, endDate);

      expect(result.rates).toEqual(
        rows({
          'USD:EUR:2024-01-01': 1.25,
          'USD:EUR:2024-01-02': 1.26,
          'USD:GBP:2024-01-01': 0.85,
        })
      );
      expect(result.complete).toBe(false);
    });

    it('should not write to the cache when the provider fails', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-02');

      vi.mocked(mockCache.getManyWithExpiry).mockResolvedValue(cached({ 'USD:EUR:2024-01-01': 1.25 }));
      vi.mocked(mockProvider.getRates).mockRejectedValue(new Error('Network request failed'));

      await service.getRates('USD', ['EUR'], startDate, endDate);

      expect(mockCache.setMany).not.toHaveBeenCalled();
    });

    it('resolves with nothing rather than rejecting when the provider fails on an empty cache', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-02');

      vi.mocked(mockCache.getManyWithExpiry).mockResolvedValue(cached({}));
      vi.mocked(mockProvider.getRates).mockRejectedValue(new Error('Network request failed'));

      const result = await service.getRatesWithStatus('USD', ['EUR'], startDate, endDate);

      expect(result.rates.size).toBe(0);
      expect(result.complete).toBe(false);
      expect(mockCache.setMany).not.toHaveBeenCalled();
    });

    it('reports a complete answer when nothing needed asking', async () => {
      vi.mocked(mockCache.getManyWithExpiry).mockResolvedValue(cached({ 'USD:EUR:2024-01-01': 1.25 }));

      const result = await service.getRatesWithStatus('USD', ['EUR'], new Date('2024-01-01'), new Date('2024-01-01'));

      expect(result.complete).toBe(true);
      expect(mockProvider.getRates).not.toHaveBeenCalled();
    });

    it('tombstones a currency the provider leaves out and stops asking for it', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new UTCDate('2024-01-03T10:00:00Z'));
      const cache = memoryCache();
      service = new ExchangeRateService(mockProvider, cache);
      vi.mocked(mockProvider.getRates).mockResolvedValue(
        published({ 'USD:EUR:2024-01-01': 1.25, 'USD:EUR:2024-01-02': 1.26 })
      );
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-02');

      const first = await service.getRates('USD', ['EUR', 'GBp'], start, end);

      expect(cache.setMany).toHaveBeenCalledWith([
        { from: 'USD', to: 'EUR', date: '2024-01-01', rate: 1.25, expiresAt: null },
        { from: 'USD', to: 'EUR', date: '2024-01-02', rate: 1.26, expiresAt: null },
        { from: 'USD', to: 'GBp', date: '2024-01-01', rate: 0, expiresAt: Date.now() + TOMBSTONE_TTL_MS },
        { from: 'USD', to: 'GBp', date: '2024-01-02', rate: 0, expiresAt: Date.now() + TOMBSTONE_TTL_MS },
      ]);
      expect(first.get('USD:GBp:2024-01-01')).toBe(0);

      const second = await service.getRatesWithStatus('USD', ['EUR', 'GBp'], start, end);

      expect(mockProvider.getRates).toHaveBeenCalledTimes(1);
      expect(second.complete).toBe(true);
      expect(second.rates).toEqual(first);
    });

    // Frankfurter answers 404 when it publishes none of the symbols asked for,
    // and the provider hands that back as an answer with nothing in it. Read as
    // an outage instead, the currency is asked for again on every cold key.
    it('tombstones a currency the provider publishes nothing for', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new UTCDate('2024-01-03T10:00:00Z'));
      const cache = memoryCache();
      service = new ExchangeRateService(mockProvider, cache);
      vi.mocked(mockProvider.getRates).mockResolvedValue(new Map());
      const day = new Date('2024-01-01');

      const first = await service.getRatesWithStatus('USD', ['UAH'], day, day);

      expect(first.complete).toBe(true);
      expect(first.rates.get('USD:UAH:2024-01-01')).toBe(0);

      const second = await service.getRatesWithStatus('USD', ['UAH'], day, day);

      expect(mockProvider.getRates).toHaveBeenCalledTimes(1);
      expect(second.complete).toBe(true);
    });

    it('asks again once a tombstone has expired', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new UTCDate('2024-01-03T10:00:00Z'));
      const cache = memoryCache();
      service = new ExchangeRateService(mockProvider, cache);
      vi.mocked(mockProvider.getRates).mockResolvedValue(new Map());
      const day = new Date('2024-01-01');

      await service.getRates('USD', ['GBp'], day, day);
      vi.setSystemTime(Date.now() + TOMBSTONE_TTL_MS + 1);
      await service.getRates('USD', ['GBp'], day, day);

      expect(mockProvider.getRates).toHaveBeenCalledTimes(2);
    });
  });

  describe('createCacheKey', () => {
    it('should create correctly formatted cache key', () => {
      const key = ExchangeRateService.createCacheKey('USD', 'EUR', '2024-01-15');
      expect(key).toBe('USD:EUR:2024-01-15');
    });
  });
});

describe('mergeRates', () => {
  it('lays the next rates over the previous ones', () => {
    const previous = rows({ a: 1, b: 2 });

    expect(mergeRates(previous, rows({ b: 3, c: 4 }))).toEqual(rows({ a: 1, b: 3, c: 4 }));
  });

  it('hands the previous Map back when the next changes nothing', () => {
    const previous = rows({ a: 1, b: 2 });

    expect(mergeRates(previous, rows({ b: 2 }))).toBe(previous);
    expect(mergeRates(previous, new Map())).toBe(previous);
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
    getManyWithExpiry: vi.fn().mockResolvedValue({ fresh: new Map(), expired: new Map() }),
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

    const requestedKeys = vi.mocked(cache.getManyWithExpiry).mock.calls[0][0];
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
