import { utcDateKey } from '../../shared/market-data'
import { TIP_TTL_MS, marketDataClient, type CachedCloses } from './market-data-client'
import { createResource } from './suspense-resource'

export const EMPTY_CLOSES: CachedCloses = { closes: new Map(), currencies: new Map() }

/**
 * One entry per symbol list and window, on UTC days: the client reads its
 * window to the day anyway, and two readers pinned milliseconds apart
 * (`usePortfolio` and the chart, both "as of now") then share one entry.
 */
export function closesKey(symbolsKey: string, from: Date, to: Date): string {
  return `${symbolsKey}|${utcDateKey(from)}|${utcDateKey(to)}`
}

export function parseClosesKey(key: string): { symbols: string[]; from: Date; to: Date } {
  const [symbolsKey, fromDay, toDay] = key.split('|')
  return {
    symbols: symbolsKey.split(','),
    from: new Date(`${fromDay}T00:00:00.000Z`),
    to: new Date(`${toDay}T00:00:00.000Z`),
  }
}

function mergeMaps<V>(previous: Map<string, V>, next: Map<string, V>): Map<string, V> {
  for (const [key, value] of next) {
    if (previous.get(key) !== value) {
      return new Map([...previous, ...next])
    }
  }
  return previous
}

/** Union, the refresh winning; the same object back when it changed nothing. */
function mergeCloses(previous: CachedCloses, next: CachedCloses): CachedCloses {
  const closes = mergeMaps(previous.closes, next.closes)
  const currencies = mergeMaps(previous.currencies, next.currencies)
  if (closes === previous.closes && currencies === previous.currencies) {
    return previous
  }
  return { closes, currencies }
}

export const closesResource = createResource<CachedCloses>({
  async fromCache(key) {
    const { symbols, from, to } = parseClosesKey(key)
    const { closes, currencies, complete, stale } = await marketDataClient.readCloses(symbols, from, to)
    return { value: { closes, currencies }, answers: complete, stale }
  },
  async load(key) {
    const { symbols, from, to } = parseClosesKey(key)
    const { closes, currencies, complete } = await marketDataClient.refreshCloses(symbols, from, to)
    return { value: { closes, currencies }, complete }
  },
  merge: mergeCloses,
  revalidateAfterMs: TIP_TTL_MS,
})
