import { ratesKey, ratesResource } from '@/lib/exchange-rates-resource'
import { useResource } from '@/lib/suspense-resource'

export interface UseExchangeRatesParams {
  baseCurrency: string | undefined
  targetCurrencies: string[]
  startDate: Date | undefined
  endDate: Date | undefined
}

export const EMPTY_RATES: Map<string, number> = new Map()

/** Nothing to ask for - no base, no targets, no range - has no key. */
function keyFor({ baseCurrency, targetCurrencies, startDate, endDate }: UseExchangeRatesParams): string | null {
  return baseCurrency && targetCurrencies.length > 0 && startDate && endDate
    ? ratesKey({ baseCurrency, targetCurrencies, startDate, endDate })
    : null
}

/**
 * The base currency's rates against the targets across the range, from the
 * cache first: suspends only while the cache cannot answer, and refreshes
 * behind the render otherwise. Nothing to ask for answers at once.
 */
export function useExchangeRates(params: UseExchangeRatesParams): Map<string, number> {
  return useResource(ratesResource, keyFor(params)) ?? EMPTY_RATES
}

/**
 * Starts the read `useExchangeRates` would make, without reading it.
 *
 * A hook that reads market data after another one has suspended does not begin
 * its own read until the first has answered, so a page pays its round trips end
 * to end. Started from above them, they run together.
 */
export function preloadExchangeRates(params: UseExchangeRatesParams): void {
  const key = keyFor(params)
  if (key) ratesResource.preload(key)
}
