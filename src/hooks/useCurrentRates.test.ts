import { renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useCurrentRates, usePreloadCurrentRates } from './useCurrentRates'
import { RATE_LOOKBACK_DAYS } from '@/lib/currency-conversion'

interface RateRequest {
  baseCurrency: string | undefined
  targetCurrencies: string[]
  startDate: Date | undefined
  endDate: Date | undefined
}

const mocks = vi.hoisted(() => ({
  baseCurrency: 'EUR' as string | undefined,
  rates: new Map<string, number>(),
  requests: [] as RateRequest[],
  preloads: [] as RateRequest[],
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { settings: { defaultCurrency: mocks.baseCurrency } } }),
}))

vi.mock('./useExchangeRates', () => ({
  useExchangeRates: (params: RateRequest) => {
    mocks.requests.push(params)
    return mocks.rates
  },
  preloadExchangeRates: (params: RateRequest) => {
    mocks.preloads.push(params)
  },
}))

const lastRequest = () => mocks.requests[mocks.requests.length - 1]

const dayKey = (daysAgo: number) =>
  `EUR:PLN:${new Date(Date.now() - daysAgo * 86_400_000).toISOString().split('T')[0]}`

describe('useCurrentRates', () => {
  beforeEach(() => {
    mocks.baseCurrency = 'EUR'
    mocks.rates = new Map()
    mocks.requests = []
    mocks.preloads = []
  })

  it('does not ask for a rate from the base currency to itself', () => {
    renderHook(() => useCurrentRates(['EUR', 'PLN']))

    expect(lastRequest().targetCurrencies).toEqual(['PLN'])
  })

  it('asks for each currency once, in a stable order', () => {
    renderHook(() => useCurrentRates(['USD', 'PLN', 'USD', 'PLN']))

    expect(lastRequest().targetCurrencies).toEqual(['PLN', 'USD'])
  })

  it('reaches back far enough to survive a weekend without a published rate', () => {
    renderHook(() => useCurrentRates(['PLN']))

    const { startDate, endDate } = lastRequest()
    const days = Math.round((endDate!.getTime() - startDate!.getTime()) / 86_400_000)
    expect(days).toBe(RATE_LOOKBACK_DAYS)
  })

  // The window is pinned at mount: rebuilt from the clock every render, the
  // converter built on it would be new every render too.
  it('holds the same window across re-renders', () => {
    const { rerender } = renderHook(() => useCurrentRates(['PLN']))
    const first = lastRequest()

    rerender()
    rerender()

    expect(lastRequest().startDate?.toISOString()).toBe(first.startDate?.toISOString())
    expect(lastRequest().endDate?.toISOString()).toBe(first.endDate?.toISOString())
  })

  it('converts with the rate it fetched', () => {
    mocks.rates = new Map([[dayKey(0), 4]])

    const { result } = renderHook(() => useCurrentRates(['PLN']))

    expect(result.current.convert(400, 'PLN')).toBe(100)
    expect(result.current.convert(100, 'EUR')).toBe(100)
  })

  // Today's rate arrives behind the render, if it is published at all.
  it("converts with yesterday's rate while today's is not there", () => {
    mocks.rates = new Map([[dayKey(1), 4]])

    const { result } = renderHook(() => useCurrentRates(['PLN']))

    expect(result.current.convert(400, 'PLN')).toBe(100)
  })

  it('reports what it could not convert rather than guessing', () => {
    const { result } = renderHook(() => useCurrentRates(['PLN']))

    expect(result.current.convert(400, 'PLN')).toBeNull()
  })

  it('keeps the converter while the rates do not change', () => {
    mocks.rates = new Map([[dayKey(0), 4]])

    const { result, rerender } = renderHook(() => useCurrentRates(['PLN']))
    const first = result.current.convert

    rerender()

    expect(result.current.convert).toBe(first)
  })

  it('exposes the base currency it converts into', () => {
    const { result } = renderHook(() => useCurrentRates(['PLN']))

    expect(result.current.baseCurrency).toBe('EUR')
  })

  // Started from above the hook that reads it, so a page does not wait out one
  // round trip before beginning the next.
  it('starts the same read the hook would make', () => {
    renderHook(() => usePreloadCurrentRates(['EUR', 'PLN']))
    const preloaded = mocks.preloads[mocks.preloads.length - 1]

    renderHook(() => useCurrentRates(['PLN']))

    expect(preloaded.baseCurrency).toBe('EUR')
    expect(preloaded.targetCurrencies).toEqual(['PLN'])
    expect(lastRequest().startDate?.toISOString().split('T')[0]).toBe(
      preloaded.startDate?.toISOString().split('T')[0]
    )
    expect(lastRequest().endDate?.toISOString().split('T')[0]).toBe(
      preloaded.endDate?.toISOString().split('T')[0]
    )
  })

  it('converts nothing until the base currency is known', () => {
    mocks.baseCurrency = undefined

    const { result } = renderHook(() => useCurrentRates(['PLN']))

    expect(result.current.convert(100, 'PLN')).toBeNull()
  })
})
