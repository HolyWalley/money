import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { UTCDate } from '@date-fns/utc'
import { YahooMarketDataProvider } from './market-data-provider-yahoo'

/**
 * Recorded from the chart endpoint for a Xetra listing. 2025-03-12 came back
 * with a null close - the instrument did not trade that day - and the timestamps
 * are the session opens in exchange local time, which is what gmtoffset is for.
 */
const CHART_RESPONSE = {
  chart: {
    result: [
      {
        meta: {
          currency: 'EUR',
          symbol: 'FWIA.DE',
          fullExchangeName: 'XETRA',
          regularMarketPrice: 41.9,
          gmtoffset: 3600,
        },
        timestamp: [1741593600, 1741680000, 1741766400, 1741852800, 1741939200],
        indicators: {
          quote: [
            {
              close: [40.1, 40.85, null, 41.4, 41.9],
            },
          ],
        },
      },
    ],
    error: null,
  },
}

/** Same shape from an exchange whose session opens on the previous UTC day. */
const SYDNEY_CHART_RESPONSE = {
  chart: {
    result: [
      {
        meta: { currency: 'AUD', symbol: 'VAS.AX', fullExchangeName: 'ASX', gmtoffset: 39600 },
        timestamp: [1741561200],
        indicators: { quote: [{ close: [98.7] }] },
      },
    ],
    error: null,
  },
}

const SEARCH_RESPONSE = {
  quotes: [
    {
      exchange: 'GER',
      shortname: 'FRANKLIN FTSE INDIA UCITS ETF',
      quoteType: 'ETF',
      symbol: 'FWIA.DE',
      exchDisp: 'XETRA',
    },
    {
      exchange: 'LSE',
      shortname: 'FRANKLIN FTSE INDIA UCITS ETF',
      longname: 'Franklin FTSE India UCITS ETF USD',
      quoteType: 'ETF',
      symbol: 'FRIN.L',
      exchDisp: 'London',
    },
    { exchange: 'NMS', shortname: 'No symbol here', quoteType: 'EQUITY' },
  ],
  news: [],
}

describe('YahooMarketDataProvider', () => {
  let provider: YahooMarketDataProvider
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    provider = new YahooMarketDataProvider()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('getDailyCloses', () => {
    it('asks for the range in unix seconds, with an exclusive upper bound', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => CHART_RESPONSE })

      await provider.getDailyCloses(
        'FWIA.DE',
        new UTCDate('2025-03-10T15:00:00Z'),
        new UTCDate('2025-03-14T15:00:00Z')
      )

      expect(fetchMock).toHaveBeenCalledWith(
        'https://query1.finance.yahoo.com/v8/finance/chart/FWIA.DE?interval=1d&period1=1741564800&period2=1741996800',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
          headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('Mozilla/5.0') }),
        })
      )
    })

    it('skips a null close instead of reading it as a price of zero', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => CHART_RESPONSE })

      const closes = await provider.getDailyCloses(
        'FWIA.DE',
        new UTCDate('2025-03-10T00:00:00Z'),
        new UTCDate('2025-03-14T00:00:00Z')
      )

      expect(closes).toEqual([
        { date: '2025-03-10', close: 40.1, currency: 'EUR' },
        { date: '2025-03-11', close: 40.85, currency: 'EUR' },
        { date: '2025-03-13', close: 41.4, currency: 'EUR' },
        { date: '2025-03-14', close: 41.9, currency: 'EUR' },
      ])
      expect(closes.some((close) => close.date === '2025-03-12')).toBe(false)
    })

    it('dates a session by the exchange calendar, not by UTC', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => SYDNEY_CHART_RESPONSE })

      const closes = await provider.getDailyCloses(
        'VAS.AX',
        new UTCDate('2025-03-10T00:00:00Z'),
        new UTCDate('2025-03-10T00:00:00Z')
      )

      // The bar opens at 2025-03-09T23:00Z, which is already 2025-03-10 in Sydney.
      expect(closes).toEqual([{ date: '2025-03-10', close: 98.7, currency: 'AUD' }])
    })

    it('throws when the response is not ok', async () => {
      fetchMock.mockResolvedValue({ ok: false, statusText: 'Too Many Requests' })

      await expect(
        provider.getDailyCloses('FWIA.DE', new UTCDate('2025-03-10T00:00:00Z'), new UTCDate('2025-03-14T00:00:00Z'))
      ).rejects.toThrow('Failed to fetch market data: Too Many Requests')
    })

    it('throws the provider error rather than reporting an empty history', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ chart: { result: null, error: { code: 'Not Found', description: 'No data found, symbol may be delisted' } } }),
      })

      await expect(
        provider.getDailyCloses('NOPE', new UTCDate('2025-03-10T00:00:00Z'), new UTCDate('2025-03-14T00:00:00Z'))
      ).rejects.toThrow('No data found, symbol may be delisted')
    })

    it('refuses prices that arrive without a currency', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          chart: {
            result: [{ meta: { symbol: 'FWIA.DE' }, timestamp: [1741593600], indicators: { quote: [{ close: [40.1] }] } }],
          },
        }),
      })

      await expect(
        provider.getDailyCloses('FWIA.DE', new UTCDate('2025-03-10T00:00:00Z'), new UTCDate('2025-03-14T00:00:00Z'))
      ).rejects.toThrow('No currency in market data for FWIA.DE')
    })

    it('returns nothing for a symbol that simply has no sessions in range', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ chart: { result: [{ meta: { currency: 'EUR' }, indicators: {} }], error: null } }),
      })

      const closes = await provider.getDailyCloses(
        'FWIA.DE',
        new UTCDate('2025-03-10T00:00:00Z'),
        new UTCDate('2025-03-14T00:00:00Z')
      )

      expect(closes).toEqual([])
    })
  })

  describe('search', () => {
    it('maps quotes to candidates and skips any without a symbol', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => SEARCH_RESPONSE })

      const candidates = await provider.search('IE00BHZRQZ17')

      expect(fetchMock).toHaveBeenCalledWith(
        'https://query1.finance.yahoo.com/v1/finance/search?q=IE00BHZRQZ17&quotesCount=10&newsCount=0',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
      expect(candidates).toEqual([
        { symbol: 'FWIA.DE', name: 'FRANKLIN FTSE INDIA UCITS ETF', currency: '', exchange: 'XETRA' },
        { symbol: 'FRIN.L', name: 'Franklin FTSE India UCITS ETF USD', currency: '', exchange: 'London' },
      ])
    })

    it('returns nothing rather than throwing when the query matches nothing', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ count: 0, news: [] }) })

      expect(await provider.search('zzzzzz')).toEqual([])
    })
  })
})
