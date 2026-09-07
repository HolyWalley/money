import { createElement } from 'react'
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { UTCDate } from '@date-fns/utc'
import {
  ExchangeRateService,
  type ExchangeRateProvider,
  type ExchangeRateValue,
} from '../../shared/exchange-rates'
import { IndexedDBExchangeRateCache } from '@/lib/exchange-rate-cache-indexeddb'
import { db } from '@/lib/db-dexie'
import { resetResources } from '@/lib/suspense-resource'
import { deferred, mountSuspended, renderHookSuspended } from '@/test/suspense'
import { EMPTY_RATES, useExchangeRates } from './useExchangeRates'

const mocks = vi.hoisted(() => ({ service: null as ExchangeRateService | null }))

vi.mock('@/lib/exchange-rate-service', () => ({
  getExchangeRateService: () => mocks.service,
}))

// A Tuesday morning: Monday's forward-filled row expired at 17:00 CET and
// Tuesday's is not published yet.
const NOW = new UTCDate('2026-09-08T09:00:00Z')
const START = new UTCDate('2026-09-01T00:00:00Z')
const HOUR_MS = 60 * 60 * 1000

const key = (currency: string, day: string) => ExchangeRateService.createCacheKey('EUR', currency, day)
const utcDay = (date: Date) => date.toISOString().split('T')[0]

/** Every day from `from` to `to` inclusive, as YYYY-MM-DD. */
function days(from: string, to: string): string[] {
  const list: string[] = []
  const cursor = new UTCDate(`${from}T00:00:00.000Z`)
  const end = new UTCDate(`${to}T00:00:00.000Z`)
  while (cursor <= end) {
    list.push(utcDay(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return list
}

async function seed(currency: string, list: string[], rate: number, expiresAt: number | null = null) {
  await db.exchangeRates.bulkPut(
    list.map(day => ({ key: key(currency, day), from: 'EUR', to: currency, date: day, rate, expiresAt }))
  )
}

const published = (currency: string, list: string[], rate: number, expiresAt: number | null = null) =>
  new Map<string, ExchangeRateValue>(list.map(day => [key(currency, day), { rate, expiresAt }]))

function Rates({ targets, end = NOW }: { targets: string[]; end?: Date }) {
  const rates = useExchangeRates({ baseCurrency: 'EUR', targetCurrencies: targets, startDate: START, endDate: end })
  const text = [...rates].map(([rateKey, rate]) => `${rateKey}=${rate}`).join(',')
  return createElement('div', { 'data-testid': 'rates' }, text)
}

describe('useExchangeRates', () => {
  let provider: { getRate: ExchangeRateProvider['getRate']; getRates: ReturnType<typeof vi.fn<ExchangeRateProvider['getRates']>> }

  beforeEach(async () => {
    resetResources()
    await db.exchangeRates.clear()
    // Only the clock: faking timers as well would stall Dexie's own plumbing.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    provider = { getRate: vi.fn(), getRates: vi.fn<ExchangeRateProvider['getRates']>() }
    mocks.service = new ExchangeRateService(provider, new IndexedDBExchangeRateCache())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each([
    { name: 'no target currencies', baseCurrency: 'EUR', targetCurrencies: [], startDate: START, endDate: NOW },
    { name: 'no base currency', baseCurrency: undefined, targetCurrencies: ['PLN'], startDate: START, endDate: NOW },
    { name: 'no dates', baseCurrency: 'EUR', targetCurrencies: ['PLN'], startDate: undefined, endDate: undefined },
  ])('answers with nothing at once when there is $name', ({ baseCurrency, targetCurrencies, startDate, endDate }) => {
    const readRates = vi.spyOn(mocks.service!, 'readRates')

    const { result } = renderHook(() =>
      useExchangeRates({ baseCurrency, targetCurrencies, startDate, endDate })
    )

    expect(result.current).toBe(EMPTY_RATES)
    expect(readRates).not.toHaveBeenCalled()
    expect(provider.getRates).not.toHaveBeenCalled()
  })

  it('renders from the cache without asking the provider', async () => {
    await seed('PLN', days('2026-09-01', '2026-09-07'), 4.2)
    await seed('PLN', ['2026-09-08'], 4.3, NOW.getTime() + HOUR_MS)

    await mountSuspended(createElement(Rates, { targets: ['PLN'] }))

    await waitFor(() => expect(screen.getByTestId('rates')).toHaveTextContent('EUR:PLN:2026-09-08=4.3'))
    expect(provider.getRates).not.toHaveBeenCalled()
  })

  it('suspends until the provider answers when the cache cannot', async () => {
    const answer = deferred<Map<string, ExchangeRateValue>>()
    provider.getRates.mockReturnValue(answer.promise)

    await mountSuspended(createElement(Rates, { targets: ['PLN'] }))

    await waitFor(() => expect(provider.getRates).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('fallback')).toBeInTheDocument()

    await act(async () => {
      answer.resolve(published('PLN', days('2026-09-01', '2026-09-08'), 4.2))
    })

    await waitFor(() => expect(screen.queryByTestId('fallback')).toBeNull())
    expect(screen.getByTestId('rates')).toHaveTextContent('EUR:PLN:2026-09-01=4.2')
    expect(screen.getByTestId('rates')).toHaveTextContent('EUR:PLN:2026-09-08=4.2')
  })

  it("renders Monday's expired rate on a Tuesday morning and refreshes it in place", async () => {
    await seed('PLN', days('2026-09-01', '2026-09-06'), 4.2)
    await seed('PLN', ['2026-09-07'], 4.25, NOW.getTime() - HOUR_MS)
    const answer = deferred<Map<string, ExchangeRateValue>>()
    provider.getRates.mockReturnValue(answer.promise)

    await mountSuspended(createElement(Rates, { targets: ['PLN'] }))

    await waitFor(() => expect(screen.getByTestId('rates')).toHaveTextContent('EUR:PLN:2026-09-07=4.25'))
    expect(screen.getByTestId('rates')).not.toHaveTextContent('2026-09-08')
    await waitFor(() => expect(provider.getRates).toHaveBeenCalledTimes(1))
    const [base, currencies, from, to] = provider.getRates.mock.calls[0]
    expect([base, currencies, utcDay(from), utcDay(to)]).toEqual(['EUR', ['PLN'], '2026-09-07', '2026-09-08'])

    await act(async () => {
      answer.resolve(
        new Map([
          ...published('PLN', ['2026-09-07'], 4.27),
          ...published('PLN', ['2026-09-08'], 4.3, NOW.getTime() + HOUR_MS),
        ])
      )
    })

    await waitFor(() => expect(screen.getByTestId('rates')).toHaveTextContent('EUR:PLN:2026-09-08=4.3'))
    expect(screen.getByTestId('rates')).toHaveTextContent('EUR:PLN:2026-09-07=4.27')
    expect(screen.queryByTestId('fallback')).toBeNull()
  })

  it('shares one entry between readers of the same day, whatever the order of their currencies', async () => {
    await seed('PLN', days('2026-09-01', '2026-09-08'), 4.2)
    await seed('USD', days('2026-09-01', '2026-09-08'), 1.1)
    const readRates = vi.spyOn(mocks.service!, 'readRates')

    const a = await renderHookSuspended(() =>
      useExchangeRates({ baseCurrency: 'EUR', targetCurrencies: ['PLN', 'USD'], startDate: START, endDate: NOW })
    )
    const b = await renderHookSuspended(() =>
      useExchangeRates({
        baseCurrency: 'EUR',
        targetCurrencies: ['USD', 'PLN'],
        startDate: START,
        endDate: new Date(NOW.getTime() + 250),
      })
    )

    await waitFor(() => expect(a.result.current).not.toBeNull())
    await waitFor(() => expect(b.result.current).not.toBeNull())

    expect(readRates).toHaveBeenCalledTimes(1)
    expect(a.result.current).toBe(b.result.current)
    expect(a.result.current.get(key('USD', '2026-09-08'))).toBe(1.1)
  })

  it('renders what the cache had when the provider fails', async () => {
    await seed('PLN', days('2026-09-01', '2026-09-03'), 4.2)
    provider.getRates.mockRejectedValue(new Error('Network request failed'))

    const { result } = await renderHookSuspended(() =>
      useExchangeRates({ baseCurrency: 'EUR', targetCurrencies: ['PLN'], startDate: START, endDate: NOW })
    )

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current.size).toBe(3)
    expect(result.current.get(key('PLN', '2026-09-03'))).toBe(4.2)
  })
})
