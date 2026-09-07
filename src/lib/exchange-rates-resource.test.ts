import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { UTCDate } from '@date-fns/utc'
import { ExchangeRateService, type RatesRead } from '../../shared/exchange-rates'
import { getExchangeRateService } from './exchange-rate-service'
import { NONE } from './suspense'
import { resetResources } from './suspense-resource'
import {
  parseRatesKey,
  ratesAnswer,
  ratesKey,
  ratesResource,
  type RatesRequest,
} from './exchange-rates-resource'

vi.mock('./exchange-rate-service', () => ({ getExchangeRateService: vi.fn() }))

// A Tuesday morning: Monday's forward-filled row expired at 17:00 CET and
// Tuesday's is not published yet.
const TUESDAY = new UTCDate('2026-09-08T09:00:00Z')

const key = (currency: string, day: string) => ExchangeRateService.createCacheKey('EUR', currency, day)
const rows = (entries: Record<string, number>) => new Map(Object.entries(entries))

/** Every day from `from` to `to` inclusive, as YYYY-MM-DD. */
function days(from: string, to: string): string[] {
  const list: string[] = []
  const cursor = new UTCDate(`${from}T00:00:00.000Z`)
  const end = new UTCDate(`${to}T00:00:00.000Z`)
  while (cursor <= end) {
    list.push(cursor.toISOString().split('T')[0])
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return list
}

const series = (currency: string, from: string, to: string, rate: number) =>
  Object.fromEntries(days(from, to).map(day => [key(currency, day), rate]))

const request = (targets: string[], start: string, end: string): RatesRequest => ({
  baseCurrency: 'EUR',
  targetCurrencies: targets,
  startDate: new UTCDate(`${start}T00:00:00Z`),
  endDate: new UTCDate(`${end}T00:00:00Z`),
})

const read = (
  rates: Record<string, number>,
  expired: Record<string, number> = {},
  missing: string[] = []
): RatesRead => ({ rates: rows(rates), expired: rows(expired), missing })

describe('ratesAnswer', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TUESDAY)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('answers from the cache, and asks for a refresh, when only today is missing', () => {
    const answer = ratesAnswer(
      read(series('PLN', '2026-09-01', '2026-09-07', 4.2), {}, [key('PLN', '2026-09-08')]),
      request(['PLN'], '2026-09-01', '2026-09-08')
    )

    expect(answer.answers).toBe(true)
    expect(answer.stale).toBe(true)
    expect(answer.value.get(key('PLN', '2026-09-07'))).toBe(4.2)
  })

  it("answers from yesterday's expired row on a Tuesday morning", () => {
    const answer = ratesAnswer(
      read(series('PLN', '2026-09-01', '2026-09-06', 4.2), { [key('PLN', '2026-09-07')]: 4.25 }, [
        key('PLN', '2026-09-08'),
      ]),
      request(['PLN'], '2026-09-01', '2026-09-08')
    )

    expect(answer.answers).toBe(true)
    expect(answer.stale).toBe(true)
    // The expired row is part of the answer: it is what findRate converts with.
    expect(answer.value.get(key('PLN', '2026-09-07'))).toBe(4.25)
  })

  // The days after the last row are the tip, however many of them there are: a
  // weekend, or a stretch the app was not opened. findRate converts at the last
  // row, which is the value the provider forward-fills those days with anyway.
  it('answers from the last row through a weekend of missing days', () => {
    const answer = ratesAnswer(
      read(series('PLN', '2026-09-01', '2026-09-04', 4.2), {}, [
        key('PLN', '2026-09-05'),
        key('PLN', '2026-09-06'),
        key('PLN', '2026-09-07'),
        key('PLN', '2026-09-08'),
      ]),
      request(['PLN'], '2026-09-01', '2026-09-08')
    )

    expect(answer.answers).toBe(true)
    expect(answer.stale).toBe(true)
    expect(answer.value.get(key('PLN', '2026-09-04'))).toBe(4.2)
  })

  it('does not answer while a day that has passed has no row', () => {
    const rates = series('PLN', '2026-09-01', '2026-09-08', 4.2)
    delete rates[key('PLN', '2026-09-04')]

    const answer = ratesAnswer(
      read(rates, {}, [key('PLN', '2026-09-04')]),
      request(['PLN'], '2026-09-01', '2026-09-08')
    )

    expect(answer.answers).toBe(false)
    expect(answer.stale).toBe(true)
  })

  it('does not answer a currency with nothing within the lookback', () => {
    const answer = ratesAnswer(
      read({}, {}, [key('PLN', '2026-09-08')]),
      request(['PLN'], '2026-09-08', '2026-09-08')
    )

    expect(answer.answers).toBe(false)
  })

  it('needs every target currency to reach a rate', () => {
    const answer = ratesAnswer(
      read({ [key('PLN', '2026-09-08')]: 4.2 }, {}, [key('USD', '2026-09-08')]),
      request(['PLN', 'USD'], '2026-09-08', '2026-09-08')
    )

    expect(answer.answers).toBe(false)
  })

  it('answers a currency the provider has tombstoned', () => {
    const answer = ratesAnswer(
      read(series('GBp', '2026-09-01', '2026-09-08', 0)),
      request(['GBp'], '2026-09-01', '2026-09-08')
    )

    expect(answer.answers).toBe(true)
    expect(answer.stale).toBe(false)
  })

  it('is settled when every row is fresh', () => {
    const cached = read(series('PLN', '2026-09-01', '2026-09-08', 4.2))

    const answer = ratesAnswer(cached, request(['PLN'], '2026-09-01', '2026-09-08'))

    expect(answer.answers).toBe(true)
    expect(answer.stale).toBe(false)
    expect(answer.value).toBe(cached.rates)
  })

  it('does not treat days still to come as holes', () => {
    const answer = ratesAnswer(
      read(series('PLN', '2026-09-01', '2026-09-07', 4.2), {}, [
        key('PLN', '2026-09-08'),
        key('PLN', '2026-09-09'),
        key('PLN', '2026-09-10'),
      ]),
      request(['PLN'], '2026-09-01', '2026-09-10')
    )

    expect(answer.answers).toBe(true)
    expect(answer.stale).toBe(true)
  })
})

describe('ratesKey', () => {
  it('keys by UTC day and by the sorted, unique targets', () => {
    const made = ratesKey({
      baseCurrency: 'EUR',
      targetCurrencies: ['USD', 'PLN', 'USD'],
      startDate: new UTCDate('2026-09-01T23:30:00Z'),
      endDate: new UTCDate('2026-09-08T09:00:00Z'),
    })

    expect(made).toBe('EUR|PLN,USD|2026-09-01|2026-09-08')
  })

  it('gives readers pinned milliseconds apart the same key', () => {
    const at = (ms: number) =>
      ratesKey({
        baseCurrency: 'EUR',
        targetCurrencies: ['PLN'],
        startDate: new UTCDate('2026-09-01T09:00:00Z'),
        endDate: new UTCDate(TUESDAY.getTime() + ms),
      })

    expect(at(0)).toBe(at(250))
  })

  it('parses back to the start of each day', () => {
    const parsed = parseRatesKey('EUR|PLN,USD|2026-09-01|2026-09-08')

    expect(parsed).toEqual({
      baseCurrency: 'EUR',
      targetCurrencies: ['PLN', 'USD'],
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-09-08T00:00:00.000Z'),
    })
  })
})

describe('ratesResource', () => {
  const readRates = vi.fn<ExchangeRateService['readRates']>()
  const getRatesWithStatus = vi.fn<ExchangeRateService['getRatesWithStatus']>()

  beforeEach(() => {
    resetResources()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TUESDAY)
    readRates.mockReset()
    getRatesWithStatus.mockReset()
    vi.mocked(getExchangeRateService).mockReturnValue({
      readRates,
      getRatesWithStatus,
    } as unknown as ExchangeRateService)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const ratesRequest = request(['PLN'], '2026-09-01', '2026-09-08')
  const entryKey = ratesKey(ratesRequest)

  it('answers from the cache and lets the provider fill today behind it', async () => {
    readRates.mockResolvedValue(
      read(series('PLN', '2026-09-01', '2026-09-07', 4.2), {}, [key('PLN', '2026-09-08')])
    )
    const complete = rows({ ...series('PLN', '2026-09-01', '2026-09-07', 4.2), [key('PLN', '2026-09-08')]: 4.3 })
    getRatesWithStatus.mockResolvedValue({ rates: complete, complete: true })

    const first = await ratesResource.preload(entryKey)

    expect(first.get(key('PLN', '2026-09-07'))).toBe(4.2)
    expect(first.has(key('PLN', '2026-09-08'))).toBe(false)
    expect(readRates).toHaveBeenCalledWith('EUR', ['PLN'], ratesRequest.startDate, ratesRequest.endDate)

    const entry = ratesResource.entry(entryKey)
    await vi.waitFor(() => {
      const value = entry.getValue()
      expect(value !== NONE && value.get(key('PLN', '2026-09-08'))).toBe(4.3)
    })
    expect(getRatesWithStatus).toHaveBeenCalledWith('EUR', ['PLN'], ratesRequest.startDate, ratesRequest.endDate)
  })

  it('resolves with what the cache had when the provider fails', async () => {
    const partial = series('PLN', '2026-09-01', '2026-09-03', 4.2)
    readRates.mockResolvedValue(read(partial, {}, days('2026-09-04', '2026-09-08').map(day => key('PLN', day))))
    getRatesWithStatus.mockResolvedValue({ rates: rows(partial), complete: false })

    const first = await ratesResource.preload(entryKey)

    expect(first).toEqual(rows(partial))
  })
})
