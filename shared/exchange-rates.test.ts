import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExchangeRateService, ExchangeRateProvider, ExchangeRateCache } from './exchange-rates';

describe('ExchangeRateService', () => {
  let mockProvider: ExchangeRateProvider;
  let mockCache: ExchangeRateCache;
  let service: ExchangeRateService;

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
      expect(mockProvider.getRate).toHaveBeenCalledWith('USD', 'EUR', date);
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

      expect(mockProvider.getRates).toHaveBeenCalledWith('USD', ['EUR', 'GBP'], startDate, endDate);
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

      expect(mockProvider.getRates).toHaveBeenCalledWith('USD', ['EUR'], startDate, endDate);
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
      expect(mockProvider.getRates).toHaveBeenCalledWith('USD', ['EUR'], startDate, endDate);
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
