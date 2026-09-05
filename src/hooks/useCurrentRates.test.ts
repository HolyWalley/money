import { renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useCurrentRates } from './useCurrentRates'
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
  isLoading: false,
  requests: [] as RateRequest[],
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { settings: { defaultCurrency: mocks.baseCurrency } } }),
}))

vi.mock('./useExchangeRates', () => ({
  useExchangeRates: (params: RateRequest) => {
    mocks.requests.push(params)
    return { rates: mocks.rates, isLoading: mocks.isLoading, error: null }
  },
}))

const lastRequest = () => mocks.requests[mocks.requests.length - 1]

describe('useCurrentRates', () => {
  beforeEach(() => {
    mocks.baseCurrency = 'EUR'
    mocks.rates = new Map()
    mocks.isLoading = false
    mocks.requests = []
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

  // The fetch keys itself on the ISO string of the window it is handed, so a
  // window rebuilt from the clock every render would refetch forever.
  it('holds the same window across re-renders', () => {
    const { rerender } = renderHook(() => useCurrentRates(['PLN']))
    const first = lastRequest()

    rerender()
    rerender()

    expect(lastRequest().startDate?.toISOString()).toBe(first.startDate?.toISOString())
    expect(lastRequest().endDate?.toISOString()).toBe(first.endDate?.toISOString())
  })

  it('converts with the rate it fetched', () => {
    const today = new Date().toISOString().split('T')[0]
    mocks.rates = new Map([[`EUR:PLN:${today}`, 4]])

    const { result } = renderHook(() => useCurrentRates(['PLN']))

    expect(result.current.convert(400, 'PLN')).toBe(100)
    expect(result.current.convert(100, 'EUR')).toBe(100)
  })

  it('reports what it could not convert rather than guessing', () => {
    const { result } = renderHook(() => useCurrentRates(['PLN']))

    expect(result.current.convert(400, 'PLN')).toBeNull()
  })

  it('exposes the base currency it converts into', () => {
    const { result } = renderHook(() => useCurrentRates(['PLN']))

    expect(result.current.baseCurrency).toBe('EUR')
  })

  it('has nothing to wait for when every wallet is already in the base currency', () => {
    mocks.isLoading = true

    const { result } = renderHook(() => useCurrentRates(['EUR', 'EUR']))

    expect(result.current.isLoading).toBe(false)
  })

  it('waits while a foreign rate is still in flight', () => {
    mocks.isLoading = true

    const { result } = renderHook(() => useCurrentRates(['PLN']))

    expect(result.current.isLoading).toBe(true)
  })

  it('converts nothing until the base currency is known', () => {
    mocks.baseCurrency = undefined

    const { result } = renderHook(() => useCurrentRates(['PLN']))

    expect(result.current.convert(100, 'PLN')).toBeNull()
  })
})
