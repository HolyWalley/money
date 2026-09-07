import { renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Transaction } from '../../shared/schemas/transaction.schema'
import type { TransactionFilters } from './useLiveTransactions'
import type { UseExchangeRatesParams } from './useExchangeRates'
import { useDecoratedTransactions } from './useDecoratedTransactions'

const mocks = vi.hoisted(() => ({
  baseCurrency: 'EUR' as string | undefined,
  transactions: [] as Transaction[],
  rates: new Map<string, number>(),
  requests: [] as UseExchangeRatesParams[],
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { settings: { defaultCurrency: mocks.baseCurrency } } }),
}))

vi.mock('./useLiveTransactions', () => ({
  useLiveTransactions: (filters: TransactionFilters | null) => (filters === null ? [] : mocks.transactions),
}))

vi.mock('./useExchangeRates', () => ({
  useExchangeRates: (params: UseExchangeRatesParams) => {
    mocks.requests.push(params)
    return mocks.rates
  },
}))

interface RowFields {
  amount: number
  currency: string
  date: string
  toCurrency?: string
}

function row(id: string, fields: RowFields): Transaction {
  const date = `${fields.date}T10:00:00.000Z`
  return {
    _id: id,
    type: 'transaction',
    transactionType: fields.toCurrency ? 'transfer' : 'expense',
    categoryId: 'c1',
    walletId: 'w1',
    createdAt: date,
    updatedAt: date,
    ...fields,
    date,
  } as Transaction
}

const FILTERS: TransactionFilters = { walletIds: ['w1'] }

const lastRequest = () => mocks.requests[mocks.requests.length - 1]

describe('useDecoratedTransactions', () => {
  beforeEach(() => {
    mocks.baseCurrency = 'EUR'
    mocks.transactions = []
    mocks.rates = new Map()
    mocks.requests = []
  })

  it('converts a foreign amount at the rate of its day', () => {
    mocks.transactions = [row('t1', { amount: 400, currency: 'PLN', date: '2026-09-03' })]
    mocks.rates = new Map([['EUR:PLN:2026-09-03', 4]])

    const { result } = renderHook(() => useDecoratedTransactions(FILTERS))

    expect(result.current).toHaveLength(1)
    expect(result.current[0]._id).toBe('t1')
    expect(result.current[0].amountInBaseCurrency).toBe(100)
  })

  // Today's rate arrives behind the render, if it is published at all; the row
  // must not read as unconverted first and as a number a moment later.
  it('converts with the nearest earlier rate when the day has none', () => {
    mocks.transactions = [row('t1', { amount: 400, currency: 'PLN', date: '2026-09-08' })]
    mocks.rates = new Map([['EUR:PLN:2026-09-07', 4]])

    const { result } = renderHook(() => useDecoratedTransactions(FILTERS))

    expect(result.current[0].amountInBaseCurrency).toBe(100)
  })

  it('leaves the amount unconverted when no rate is within reach', () => {
    mocks.transactions = [row('t1', { amount: 400, currency: 'PLN', date: '2026-09-08' })]
    mocks.rates = new Map([['EUR:PLN:2026-08-20', 4]])

    const { result } = renderHook(() => useDecoratedTransactions(FILTERS))

    expect(result.current[0].amountInBaseCurrency).toBeNull()
  })

  it('passes an amount already in the base currency through', () => {
    mocks.transactions = [row('t1', { amount: 100, currency: 'EUR', date: '2026-09-03' })]

    const { result } = renderHook(() => useDecoratedTransactions(FILTERS))

    expect(result.current[0].amountInBaseCurrency).toBe(100)
  })

  it('asks for every foreign currency across the span of the rows', () => {
    mocks.transactions = [
      row('t1', { amount: 10, currency: 'USD', date: '2026-09-05', toCurrency: 'GBP' }),
      row('t2', { amount: 10, currency: 'EUR', date: '2026-09-03' }),
      row('t3', { amount: 10, currency: 'PLN', date: '2026-09-01' }),
    ]

    renderHook(() => useDecoratedTransactions(FILTERS))

    const request = lastRequest()
    expect(request.baseCurrency).toBe('EUR')
    expect(request.targetCurrencies).toEqual(['USD', 'GBP', 'PLN'])
    expect(request.startDate?.toISOString()).toBe('2026-09-01T10:00:00.000Z')
    expect(request.endDate?.toISOString()).toBe('2026-09-05T10:00:00.000Z')
  })

  it('asks for nothing and returns nothing for null filters', () => {
    mocks.transactions = [row('t1', { amount: 400, currency: 'PLN', date: '2026-09-03' })]

    const { result } = renderHook(() => useDecoratedTransactions(null))

    expect(result.current).toEqual([])
    expect(lastRequest().targetCurrencies).toEqual([])
    expect(lastRequest().startDate).toBeUndefined()
  })

  it('converts nothing until the base currency is known', () => {
    mocks.baseCurrency = undefined
    mocks.transactions = [row('t1', { amount: 400, currency: 'PLN', date: '2026-09-03' })]
    mocks.rates = new Map([['EUR:PLN:2026-09-03', 4]])

    const { result } = renderHook(() => useDecoratedTransactions(FILTERS))

    expect(result.current[0].amountInBaseCurrency).toBeNull()
    expect(lastRequest().targetCurrencies).toEqual([])
  })

  it('hands back the same rows while nothing changed', () => {
    mocks.transactions = [row('t1', { amount: 400, currency: 'PLN', date: '2026-09-03' })]
    mocks.rates = new Map([['EUR:PLN:2026-09-03', 4]])

    const { result, rerender } = renderHook(() => useDecoratedTransactions(FILTERS))
    const first = result.current

    rerender()

    expect(result.current).toBe(first)
  })
})
