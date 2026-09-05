import { ExchangeRateService } from '../../shared/exchange-rates'

/**
 * How many calendar days back a conversion will look for a rate.
 *
 * Rates are published per day and the most recent one is regularly missing - a
 * provider that has not posted today yet, a weekend, a bank holiday. A balance
 * converted with last Friday's rate is right to within a rounding error; a
 * balance dropped for want of today's rate silently understates the total.
 */
export const RATE_LOOKBACK_DAYS = 7

export type Converter = (amount: number, currency: string) => number | null

export interface ConvertedTotal {
  total: number
  missingCurrencies: string[]
}

// Rate keys are built from the UTC calendar date, both when the range is
// enumerated and when a transaction looks one up.
function utcDateKey(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function findRate(
  rates: Map<string, number>,
  baseCurrency: string,
  currency: string,
  onDate: Date,
  lookbackDays: number = RATE_LOOKBACK_DAYS
): number | null {
  if (currency === baseCurrency) {
    return 1
  }

  const cursor = new Date(onDate.getTime())

  for (let i = 0; i <= lookbackDays; i++) {
    const key = ExchangeRateService.createCacheKey(baseCurrency, currency, utcDateKey(cursor))
    const rate = rates.get(key)
    if (rate !== undefined && rate > 0) {
      return rate
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  return null
}

/**
 * Converts an amount into the base currency as of `onDate`, or returns null
 * when no rate is available. Null rather than zero: a total that quietly drops
 * a wallet reads as a smaller total, not as an incomplete one.
 */
export function createConverter(
  rates: Map<string, number>,
  baseCurrency: string | undefined,
  onDate: Date,
  lookbackDays: number = RATE_LOOKBACK_DAYS
): Converter {
  return (amount, currency) => {
    if (!baseCurrency) {
      return null
    }
    if (currency === baseCurrency) {
      return amount
    }

    const rate = findRate(rates, baseCurrency, currency, onDate, lookbackDays)
    if (rate === null) {
      return null
    }

    // Rates are quoted as units of `currency` per one unit of the base, which
    // is why coming back into the base divides rather than multiplies.
    return amount / rate
  }
}

export function sumToBase(
  totalsByCurrency: Map<string, number>,
  convert: Converter
): ConvertedTotal {
  let total = 0
  const missing = new Set<string>()

  for (const [currency, amount] of totalsByCurrency) {
    const converted = convert(amount, currency)
    if (converted === null) {
      missing.add(currency)
      continue
    }
    total += converted
  }

  return { total, missingCurrencies: [...missing].sort() }
}
