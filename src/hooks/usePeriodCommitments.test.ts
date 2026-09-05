import { renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePeriodCommitments } from './usePeriodCommitments'
import type { Converter } from '@/lib/currency-conversion'

const mocks = vi.hoisted(() => ({
  recurringTotals: new Map<string, number>(),
  savingsTotals: new Map<string, number>(),
  recurringLoading: false,
  savingsLoading: false,
  ratesLoading: false,
  currenciesAsked: [] as string[],
}))

vi.mock('./useUpcomingPayments', () => ({
  useUpcomingPayments: () => ({
    totalsByCurrency: mocks.recurringTotals,
    isLoading: mocks.recurringLoading,
  }),
}))

vi.mock('./useSavingsSuggestions', () => ({
  useSavingsSuggestions: () => ({
    totalsByCurrency: mocks.savingsTotals,
    isLoading: mocks.savingsLoading,
  }),
}))

// Halves anything in PLN and cannot price USD at all.
const convert: Converter = (amount, currency) => {
  if (currency === 'EUR') return amount
  if (currency === 'PLN') return amount / 2
  return null
}

vi.mock('./useCurrentRates', () => ({
  useCurrentRates: (currencies: string[]) => {
    mocks.currenciesAsked = currencies
    return { convert, baseCurrency: 'EUR', isLoading: mocks.ratesLoading }
  },
}))

const periodStart = new Date(2026, 8, 1)
const periodEnd = new Date(2026, 8, 30, 23, 59, 59)

const render = () => renderHook(() => usePeriodCommitments(periodStart, periodEnd)).result

describe('usePeriodCommitments', () => {
  beforeEach(() => {
    mocks.recurringTotals = new Map()
    mocks.savingsTotals = new Map()
    mocks.recurringLoading = false
    mocks.savingsLoading = false
    mocks.ratesLoading = false
    mocks.currenciesAsked = []
  })

  it('is nothing owed when nothing is outstanding', () => {
    const { current } = render()

    expect(current).toMatchObject({ recurring: 0, savings: 0, total: 0, missingCurrencies: [] })
  })

  // The two halves never overlap: a payment's saved portion is netted out
  // upstream, so what lands here is what a spendable wallet still has to cover.
  it('keeps recurring payments and savings transfers apart, and adds them up', () => {
    mocks.recurringTotals = new Map([['EUR', 940]])
    mocks.savingsTotals = new Map([['EUR', 400]])

    const { current } = render()

    expect(current.recurring).toBe(940)
    expect(current.savings).toBe(400)
    expect(current.total).toBe(1340)
  })

  it('brings a foreign-currency payment into the base currency', () => {
    mocks.recurringTotals = new Map([['EUR', 100], ['PLN', 400]])

    const { current } = render()

    expect(current.recurring).toBe(300)
  })

  it('asks for a rate for every currency it has to convert', () => {
    mocks.recurringTotals = new Map([['PLN', 400]])
    mocks.savingsTotals = new Map([['USD', 50]])

    render()

    expect([...mocks.currenciesAsked].sort()).toEqual(['PLN', 'USD'])
  })

  it('names an unpriced currency once, however many sides it appears on', () => {
    mocks.recurringTotals = new Map([['EUR', 100], ['USD', 30]])
    mocks.savingsTotals = new Map([['USD', 20]])

    const { current } = render()

    expect(current.total).toBe(100)
    expect(current.missingCurrencies).toEqual(['USD'])
  })

  it('waits while the recurring payments are still loading', () => {
    mocks.recurringLoading = true

    expect(render().current.isLoading).toBe(true)
  })

  it('waits while the savings suggestions are still loading', () => {
    mocks.savingsLoading = true

    expect(render().current.isLoading).toBe(true)
  })

  it('waits while a rate is still in flight', () => {
    mocks.ratesLoading = true

    expect(render().current.isLoading).toBe(true)
  })
})
