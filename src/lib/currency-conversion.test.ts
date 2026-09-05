import { describe, it, expect } from 'vitest'
import { findRate, createConverter, sumToBase, RATE_LOOKBACK_DAYS } from './currency-conversion'

// Keys are `from:to:YYYY-MM-DD` with the date in UTC, matching how the range is
// enumerated when rates are fetched.
function rates(entries: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(entries))
}

const day = (isoDay: string) => new Date(`${isoDay}T12:00:00.000Z`)

describe('findRate', () => {
  it('takes the rate published on the day itself', () => {
    const found = findRate(rates({ 'EUR:PLN:2026-09-05': 4.3 }), 'EUR', 'PLN', day('2026-09-05'))

    expect(found).toBe(4.3)
  })

  it('is 1 for the base currency, with no rate needed', () => {
    expect(findRate(new Map(), 'EUR', 'EUR', day('2026-09-05'))).toBe(1)
  })

  // Weekends, bank holidays, a provider that has not posted yet.
  it('falls back to the most recent earlier day', () => {
    const found = findRate(
      rates({ 'EUR:PLN:2026-09-02': 4.1, 'EUR:PLN:2026-09-03': 4.2 }),
      'EUR',
      'PLN',
      day('2026-09-05')
    )

    expect(found).toBe(4.2)
  })

  it('reaches back exactly as far as the lookback allows', () => {
    const stale = day('2026-09-05')
    stale.setUTCDate(stale.getUTCDate() - RATE_LOOKBACK_DAYS)
    const key = `EUR:PLN:${stale.toISOString().split('T')[0]}`

    expect(findRate(rates({ [key]: 4.0 }), 'EUR', 'PLN', day('2026-09-05'))).toBe(4.0)
  })

  it('gives up rather than reaching past the lookback', () => {
    expect(findRate(rates({ 'EUR:PLN:2026-08-01': 4.0 }), 'EUR', 'PLN', day('2026-09-05'))).toBeNull()
  })

  it('ignores a zero rate instead of dividing by it', () => {
    const found = findRate(
      rates({ 'EUR:PLN:2026-09-05': 0, 'EUR:PLN:2026-09-04': 4.2 }),
      'EUR',
      'PLN',
      day('2026-09-05')
    )

    expect(found).toBe(4.2)
  })

  it('does not confuse one target currency for another', () => {
    expect(findRate(rates({ 'EUR:USD:2026-09-05': 1.1 }), 'EUR', 'PLN', day('2026-09-05'))).toBeNull()
  })
})

describe('createConverter', () => {
  const convert = createConverter(rates({ 'EUR:PLN:2026-09-05': 4 }), 'EUR', day('2026-09-05'))

  it('passes base-currency amounts straight through', () => {
    expect(convert(120.5, 'EUR')).toBe(120.5)
  })

  // Rates are units of the foreign currency per one base unit.
  it('divides by the rate to come back into the base currency', () => {
    expect(convert(400, 'PLN')).toBe(100)
  })

  it('converts a negative balance without changing its sign', () => {
    expect(convert(-400, 'PLN')).toBe(-100)
  })

  it('reports no answer rather than a wrong one when the rate is missing', () => {
    expect(convert(400, 'GBP')).toBeNull()
  })

  it('converts nothing at all before the base currency is known', () => {
    const unknownBase = createConverter(rates({ 'EUR:PLN:2026-09-05': 4 }), undefined, day('2026-09-05'))

    expect(unknownBase(120, 'EUR')).toBeNull()
  })
})

describe('sumToBase', () => {
  const convert = createConverter(
    rates({ 'EUR:PLN:2026-09-05': 4, 'EUR:USD:2026-09-05': 2 }),
    'EUR',
    day('2026-09-05')
  )

  it('adds up amounts held in different currencies', () => {
    const totals = new Map([['EUR', 100], ['PLN', 400], ['USD', 200]])

    expect(sumToBase(totals, convert)).toEqual({ total: 300, missingCurrencies: [] })
  })

  // A total that silently drops a currency reads as a smaller total rather than
  // an incomplete one, so what it could not convert comes back with it.
  it('names the currencies it could not convert', () => {
    const totals = new Map([['EUR', 100], ['GBP', 50], ['CHF', 20]])

    expect(sumToBase(totals, convert)).toEqual({ total: 100, missingCurrencies: ['CHF', 'GBP'] })
  })

  it('is zero for nothing at all', () => {
    expect(sumToBase(new Map(), convert)).toEqual({ total: 0, missingCurrencies: [] })
  })
})
