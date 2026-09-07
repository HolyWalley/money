import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FrankfurterExchangeRateProvider } from './exchange-rate-provider-frankfurter';

describe('FrankfurterExchangeRateProvider', () => {
  let provider: FrankfurterExchangeRateProvider;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    provider = new FrankfurterExchangeRateProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getRate', () => {
    it('should fetch single exchange rate', async () => {
      const mockResponse = {
        amount: 1.0,
        base: 'USD',
        start_date: '2024-01-15',
        end_date: '2024-01-15',
        rates: {
          '2024-01-15': {
            EUR: 1.25,
          },
        },
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const rateValue = await provider.getRate('USD', 'EUR', new Date('2024-01-15'));

      expect(rateValue.rate).toBe(1.25);
      expect(rateValue.expiresAt).toBeDefined();
      // Should fetch 7 days before to ensure seed rate
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.frankfurter.dev/v1/2024-01-08..2024-01-15?base=USD&symbols=EUR',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it('should throw error if response is not ok', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
      });

      await expect(
        provider.getRate('USD', 'EUR', new Date('2024-01-15'))
      ).rejects.toThrow('Failed to fetch exchange rates: Not Found');
    });

    it('should throw error if rate not found in response', async () => {
      const mockResponse = {
        amount: 1.0,
        base: 'USD',
        start_date: '2024-01-15',
        end_date: '2024-01-15',
        rates: {},
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(
        provider.getRate('USD', 'EUR', new Date('2024-01-15'))
      ).rejects.toThrow('Exchange rate not found for USD to EUR on 2024-01-15');
    });

    it('should handle dates with time correctly', async () => {
      const mockResponse = {
        amount: 1.0,
        base: 'USD',
        start_date: '2024-01-15',
        end_date: '2024-01-15',
        rates: {
          '2024-01-15': {
            EUR: 1.25,
          },
        },
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await provider.getRate('USD', 'EUR', new Date('2024-01-15T14:30:00Z'));

      // Should fetch 7 days before to ensure seed rate
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.frankfurter.dev/v1/2024-01-08..2024-01-15?base=USD&symbols=EUR',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });
  });

  describe('getRates', () => {
    it('should fetch exchange rates for date range and multiple currencies', async () => {
      const mockResponse = {
        amount: 1.0,
        base: 'USD',
        start_date: '2024-01-15',
        end_date: '2024-01-17',
        rates: {
          '2024-01-15': {
            EUR: 1.25,
            GBP: 0.85,
          },
          '2024-01-16': {
            EUR: 1.26,
            GBP: 0.86,
          },
          '2024-01-17': {
            EUR: 1.27,
            GBP: 0.87,
          },
        },
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await provider.getRates(
        'USD',
        ['EUR', 'GBP'],
        new Date('2024-01-15'),
        new Date('2024-01-17')
      );

      expect(result.size).toBe(6);
      expect(result.get('USD:EUR:2024-01-15')?.rate).toBe(1.25);
      expect(result.get('USD:GBP:2024-01-15')?.rate).toBe(0.85);
      expect(result.get('USD:EUR:2024-01-16')?.rate).toBe(1.26);
      expect(result.get('USD:GBP:2024-01-16')?.rate).toBe(0.86);
      expect(result.get('USD:EUR:2024-01-17')?.rate).toBe(1.27);
      expect(result.get('USD:GBP:2024-01-17')?.rate).toBe(0.87);

      // Should fetch 7 days before to ensure seed rate
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.frankfurter.dev/v1/2024-01-08..2024-01-17?base=USD&symbols=EUR,GBP',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it('should handle single currency', async () => {
      const mockResponse = {
        amount: 1.0,
        base: 'USD',
        start_date: '2024-01-15',
        end_date: '2024-01-16',
        rates: {
          '2024-01-15': {
            EUR: 1.25,
          },
          '2024-01-16': {
            EUR: 1.26,
          },
        },
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await provider.getRates(
        'USD',
        ['EUR'],
        new Date('2024-01-15'),
        new Date('2024-01-16')
      );

      expect(result.size).toBe(2);
      expect(result.get('USD:EUR:2024-01-15')?.rate).toBe(1.25);
      expect(result.get('USD:EUR:2024-01-16')?.rate).toBe(1.26);

      // Should fetch 7 days before to ensure seed rate
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.frankfurter.dev/v1/2024-01-08..2024-01-16?base=USD&symbols=EUR',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it('should throw error if response is not ok', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        statusText: 'Bad Request',
      });

      await expect(
        provider.getRates('USD', ['EUR'], new Date('2024-01-15'), new Date('2024-01-16'))
      ).rejects.toThrow('Failed to fetch exchange rates: Bad Request');
    });

    // 404 is what Frankfurter answers when it publishes none of the currencies
    // asked for - UAH alone, say. An answer with nothing in it, so the caller
    // can record that and stop asking, not a failure worth retrying.
    it('answers with nothing for a currency it does not publish', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await provider.getRates(
        'USD',
        ['UAH'],
        new Date('2024-01-15'),
        new Date('2024-01-16')
      );

      expect(result.size).toBe(0);
    });

    it('should handle empty rates response', async () => {
      const mockResponse = {
        amount: 1.0,
        base: 'USD',
        start_date: '2024-01-15',
        end_date: '2024-01-16',
        rates: {},
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await provider.getRates(
        'USD',
        ['EUR'],
        new Date('2024-01-15'),
        new Date('2024-01-16')
      );

      expect(result.size).toBe(0);
    });

    it('should use lookback data to seed rates for weekend start dates', async () => {
      // Scenario: Saturday/Sunday have no data, but previous Friday does
      // Request: Sat Jan 20 to Wed Jan 24
      // API returns: Fri Jan 19 rate + Mon-Wed rates
      const mockResponse = {
        amount: 1.0,
        base: 'USD',
        start_date: '2024-01-13',
        end_date: '2024-01-24',
        rates: {
          '2024-01-19': { EUR: 1.20 }, // Friday before weekend
          '2024-01-22': { EUR: 1.21 }, // Monday
          '2024-01-23': { EUR: 1.22 }, // Tuesday
          '2024-01-24': { EUR: 1.23 }, // Wednesday
        },
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await provider.getRates(
        'USD',
        ['EUR'],
        new Date('2024-01-20'), // Saturday
        new Date('2024-01-24')  // Wednesday
      );

      // Should return rates for all 5 days (Sat, Sun, Mon, Tue, Wed)
      expect(result.size).toBe(5);
      // Saturday and Sunday forward-filled from Friday
      expect(result.get('USD:EUR:2024-01-20')?.rate).toBe(1.20);
      expect(result.get('USD:EUR:2024-01-21')?.rate).toBe(1.20);
      // Monday through Wednesday have real data
      expect(result.get('USD:EUR:2024-01-22')?.rate).toBe(1.21);
      expect(result.get('USD:EUR:2024-01-23')?.rate).toBe(1.22);
      expect(result.get('USD:EUR:2024-01-24')?.rate).toBe(1.23);

      // Should have fetched 7 days before
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.frankfurter.dev/v1/2024-01-13..2024-01-24?base=USD&symbols=EUR',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });
  });

  describe('request timeout', () => {
    it('should pass an unaborted AbortSignal to fetch', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          amount: 1.0,
          base: 'USD',
          start_date: '2024-01-15',
          end_date: '2024-01-15',
          rates: { '2024-01-15': { EUR: 1.25 } },
        }),
      });

      await provider.getRates('USD', ['EUR'], new Date('2024-01-15'), new Date('2024-01-15'));

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(init.signal!.aborted).toBe(false);
    });

    it('should honour the constructor timeoutMs and reject when it elapses', async () => {
      const impatientProvider = new FrankfurterExchangeRateProvider(
        'https://api.frankfurter.dev/v1',
        1
      );

      // Stand in for a stalled connection: resolve nothing, fail only when aborted
      fetchMock.mockImplementation((_url: string, init: RequestInit) => {
        const signal = init.signal!;
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason));
        });
      });

      await expect(
        impatientProvider.getRates('USD', ['EUR'], new Date('2024-01-15'), new Date('2024-01-16'))
      ).rejects.toMatchObject({ name: 'TimeoutError' });
    });
  });

  describe('custom base URL', () => {
    it('should use custom base URL when provided', async () => {
      const customProvider = new FrankfurterExchangeRateProvider('https://custom.api.com');

      const mockResponse = {
        amount: 1.0,
        base: 'USD',
        start_date: '2024-01-15',
        end_date: '2024-01-15',
        rates: {
          '2024-01-15': {
            EUR: 1.25,
          },
        },
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await customProvider.getRate('USD', 'EUR', new Date('2024-01-15'));

      // Should fetch 7 days before to ensure seed rate
      expect(fetchMock).toHaveBeenCalledWith(
        'https://custom.api.com/2024-01-08..2024-01-15?base=USD&symbols=EUR',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });
  });

  // Every key this provider emits comes from toISOString(), i.e. the UTC day. The
  // enumeration and the 7-day lookback used to read LOCAL components, so in any
  // non-UTC zone the days it asked for and the keys it returned were off by one --
  // invisible on a UTC CI machine, so these pin the zone themselves.
  describe('timezone independence', () => {
    const originalTZ = process.env.TZ;

    afterEach(() => {
      process.env.TZ = originalTZ;
    });

    for (const tz of ['UTC', 'America/New_York', 'Europe/Warsaw', 'Pacific/Auckland']) {
      it(`keys rates by UTC day and requests the UTC range under ${tz}`, async () => {
        process.env.TZ = tz;

        fetchMock.mockResolvedValue({
          ok: true,
          json: async () => ({
            amount: 1.0,
            base: 'USD',
            start_date: '2024-01-15',
            end_date: '2024-01-16',
            rates: {
              '2024-01-15': { EUR: 1.25 },
              '2024-01-16': { EUR: 1.3 },
            },
          }),
        });

        // 23:30Z on the 15th and 02:30Z on the 16th: two instants that straddle local
        // midnight in both directions, so a local-component reading picks the wrong day.
        const rates = await provider.getRates(
          'USD',
          ['EUR'],
          new Date('2024-01-15T23:30:00.000Z'),
          new Date('2024-01-16T02:30:00.000Z')
        );

        expect(fetchMock).toHaveBeenCalledWith(
          'https://api.frankfurter.dev/v1/2024-01-08..2024-01-16?base=USD&symbols=EUR',
          expect.objectContaining({ signal: expect.any(AbortSignal) })
        );
        expect(rates.get('USD:EUR:2024-01-15')?.rate).toBe(1.25);
        expect(rates.get('USD:EUR:2024-01-16')?.rate).toBe(1.3);
        expect(rates.size).toBe(2);
      });
    }
  });

  // Expiry is an instant on the CET clock, whatever zone the browser keeps.
  // Set from the local hour it landed an hour or two off outside UTC, and in
  // Warsaw's summer a row stored between 15:00 and 16:00 was born expired.
  describe('expiry', () => {
    const originalTZ = process.env.TZ;

    function answering(rates: Record<string, Record<string, number>>) {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ amount: 1.0, base: 'USD', rates }),
      });
    }

    async function expiryOf(day: string) {
      const at = new Date(`${day}T00:00:00.000Z`);
      const rates = await provider.getRates('USD', ['EUR'], at, at);
      return rates.get(`USD:EUR:${day}`)?.expiresAt;
    }

    afterEach(() => {
      process.env.TZ = originalTZ;
      vi.useRealTimers();
    });

    for (const tz of ['UTC', 'Europe/Warsaw', 'America/New_York']) {
      it(`expires today's rate at 17:00 CEST in summer under ${tz}`, async () => {
        process.env.TZ = tz;
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-07-15T07:30:00.000Z'));
        answering({ '2026-07-14': { EUR: 0.9 } });

        expect(await expiryOf('2026-07-15')).toBe(Date.UTC(2026, 6, 15, 15));
      });

      it(`expires today's rate at 17:00 CET in winter under ${tz}`, async () => {
        process.env.TZ = tz;
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-01-15T08:00:00.000Z'));
        answering({ '2026-01-14': { EUR: 0.9 } });

        expect(await expiryOf('2026-01-15')).toBe(Date.UTC(2026, 0, 15, 16));
      });

      it(`stores a row written at 15:30 CEST as still valid under ${tz}`, async () => {
        process.env.TZ = tz;
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-07-15T13:30:00.000Z'));
        answering({ '2026-07-14': { EUR: 0.9 } });

        const expiresAt = await expiryOf('2026-07-15');
        expect(expiresAt).toBe(Date.UTC(2026, 6, 15, 15));
        expect(expiresAt).toBeGreaterThan(Date.now());
      });
    }

    it('expires a future day at 17:00 CET on that day', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-07-15T07:30:00.000Z'));
      answering({ '2026-07-15': { EUR: 0.9 } });

      const rates = await provider.getRates(
        'USD',
        ['EUR'],
        new Date('2026-07-15T00:00:00.000Z'),
        new Date('2026-07-16T00:00:00.000Z')
      );
      expect(rates.get('USD:EUR:2026-07-16')?.expiresAt).toBe(Date.UTC(2026, 6, 16, 15));
    });

    it('keeps a published rate for good after 16:00 CET, and a forward-filled one for an hour', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-07-15T14:30:00.000Z'));

      answering({ '2026-07-15': { EUR: 0.9 } });
      expect(await expiryOf('2026-07-15')).toBeNull();

      answering({ '2026-07-14': { EUR: 0.9 } });
      expect(await expiryOf('2026-07-15')).toBe(Date.now() + 60 * 60 * 1000);
    });

    it('reads the day late in the UTC evening as already published', async () => {
      // 23:30Z is 01:30 CEST of the next day: the UTC day's rate is long out,
      // so a real one stands and a forward-filled one is retried in an hour,
      // never stamped with an expiry hours in the past.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-07-15T23:30:00.000Z'));

      answering({ '2026-07-15': { EUR: 0.9 } });
      expect(await expiryOf('2026-07-15')).toBeNull();

      answering({ '2026-07-14': { EUR: 0.9 } });
      expect(await expiryOf('2026-07-15')).toBe(Date.now() + 60 * 60 * 1000);
    });
  });
});
