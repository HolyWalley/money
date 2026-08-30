import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useExchangeRates } from './useExchangeRates'
import { getExchangeRateService } from '@/lib/exchange-rate-service'

vi.mock('@/lib/exchange-rate-service', () => ({
  getExchangeRateService: vi.fn(),
}))

const startDate = new Date('2024-01-01T00:00:00.000Z')
const endDate = new Date('2024-01-02T00:00:00.000Z')

describe('useExchangeRates', () => {
  let getRates: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getRates = vi.fn()
    vi.mocked(getExchangeRateService).mockReturnValue({
      getRates,
    } as unknown as ReturnType<typeof getExchangeRateService>)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('settles isLoading to false when there are no target currencies', () => {
    const { result } = renderHook(() =>
      useExchangeRates({ baseCurrency: 'USD', targetCurrencies: [], startDate, endDate }),
    )

    expect(result.current.isLoading).toBe(false)
    expect(getRates).not.toHaveBeenCalled()
  })

  it('settles isLoading to false when there is no base currency', () => {
    const { result } = renderHook(() =>
      useExchangeRates({
        baseCurrency: undefined,
        targetCurrencies: ['EUR'],
        startDate,
        endDate,
      }),
    )

    expect(result.current.isLoading).toBe(false)
    expect(getRates).not.toHaveBeenCalled()
  })

  it('settles isLoading to false when the date range is incomplete', () => {
    const { result } = renderHook(() =>
      useExchangeRates({
        baseCurrency: 'USD',
        targetCurrencies: ['EUR'],
        startDate: undefined,
        endDate: undefined,
      }),
    )

    expect(result.current.isLoading).toBe(false)
    expect(getRates).not.toHaveBeenCalled()
  })

  it('populates rates on a successful fetch', async () => {
    getRates.mockResolvedValue(new Map([['USD:EUR:2024-01-01', 1.25]]))

    const { result } = renderHook(() =>
      useExchangeRates({ baseCurrency: 'USD', targetCurrencies: ['EUR'], startDate, endDate }),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.rates.get('USD:EUR:2024-01-01')).toBe(1.25)
    expect(result.current.error).toBeNull()
    expect(getRates).toHaveBeenCalledWith('USD', ['EUR'], startDate, endDate)
  })

  it('surfaces an error without throwing when the fetch rejects', async () => {
    const failure = new Error('Network request failed')
    getRates.mockRejectedValue(failure)

    const { result } = renderHook(() =>
      useExchangeRates({ baseCurrency: 'USD', targetCurrencies: ['EUR'], startDate, endDate }),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe(failure)
    expect(result.current.rates.size).toBe(0)
  })

  it('keeps previously loaded rates when a later fetch rejects', async () => {
    getRates.mockResolvedValue(new Map([['USD:EUR:2024-01-01', 1.25]]))

    const { result, rerender } = renderHook(
      ({ currencies }: { currencies: string[] }) =>
        useExchangeRates({
          baseCurrency: 'USD',
          targetCurrencies: currencies,
          startDate,
          endDate,
        }),
      { initialProps: { currencies: ['EUR'] } },
    )

    await waitFor(() => expect(result.current.rates.size).toBe(1))

    getRates.mockRejectedValue(new Error('Network request failed'))
    rerender({ currencies: ['EUR', 'GBP'] })

    await waitFor(() => expect(result.current.error).not.toBeNull())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.rates.get('USD:EUR:2024-01-01')).toBe(1.25)
  })

  describe('superseded runs', () => {
    const full = new Map([
      ['USD:EUR:2024-01-01', 1.25],
      ['USD:GBP:2024-01-01', 0.8],
    ])
    // What a provider failure now resolves with: the cached subset, strictly smaller
    const partial = new Map([['USD:EUR:2024-01-01', 1.11]])

    const renderWithCurrencies = (currencies: string[]) =>
      renderHook(
        ({ currencies }: { currencies: string[] }) =>
          useExchangeRates({
            baseCurrency: 'USD',
            targetCurrencies: currencies,
            startDate,
            endDate,
          }),
        { initialProps: { currencies } },
      )

    it('does not let a stale partial result overwrite a newer complete one', async () => {
      let resolveStale: (rates: Map<string, number>) => void = () => {}
      getRates.mockImplementationOnce(
        () => new Promise<Map<string, number>>(resolve => { resolveStale = resolve }),
      )
      getRates.mockResolvedValue(full)

      const { result, rerender } = renderWithCurrencies(['EUR'])
      rerender({ currencies: ['EUR', 'GBP'] })

      await waitFor(() => expect(result.current.rates.size).toBe(2))

      await act(async () => {
        resolveStale(partial)
      })

      expect(result.current.rates).toEqual(full)
      expect(result.current.error).toBeNull()
    })

    it('does not let a stale rejection raise an error over a newer success', async () => {
      let rejectStale: (error: Error) => void = () => {}
      getRates.mockImplementationOnce(
        () => new Promise<Map<string, number>>((_resolve, reject) => { rejectStale = reject }),
      )
      getRates.mockResolvedValue(full)

      const { result, rerender } = renderWithCurrencies(['EUR'])
      rerender({ currencies: ['EUR', 'GBP'] })

      await waitFor(() => expect(result.current.rates.size).toBe(2))

      await act(async () => {
        rejectStale(new Error('Network request failed'))
      })

      expect(result.current.error).toBeNull()
      expect(result.current.rates).toEqual(full)
    })

    it('keeps isLoading true while the newest run is still in flight', async () => {
      let resolveStale: (rates: Map<string, number>) => void = () => {}
      getRates.mockImplementationOnce(
        () => new Promise<Map<string, number>>(resolve => { resolveStale = resolve }),
      )
      getRates.mockImplementationOnce(() => new Promise<Map<string, number>>(() => {}))

      const { result, rerender } = renderWithCurrencies(['EUR'])
      rerender({ currencies: ['EUR', 'GBP'] })

      await act(async () => {
        resolveStale(partial)
      })

      expect(result.current.isLoading).toBe(true)
      expect(result.current.rates.size).toBe(0)
    })
  })
})
