import { EMPTY_CLOSES, closesKey, closesResource } from '@/lib/prices-resource'
import type { CachedCloses } from '@/lib/market-data-client'
import { useResource } from '@/lib/suspense-resource'

/** Nothing to price - no symbols, or no first trade yet - has no key. */
function keyFor(symbolsKey: string, from: Date | null, to: Date): string | null {
  return symbolsKey && from ? closesKey(symbolsKey, from, to) : null
}

/**
 * Closes for the symbols in `symbolsKey` (joined and sorted) across [from, to],
 * from the cache first: the read suspends only when the cache cannot answer,
 * and a stale answer is refreshed behind what is on screen.
 *
 * Nothing to price - no symbols, or no first trade yet - answers at once.
 */
export function useCloses(symbolsKey: string, from: Date | null, to: Date): CachedCloses {
  return useResource(closesResource, keyFor(symbolsKey, from, to)) ?? EMPTY_CLOSES
}

/**
 * Starts the read `useCloses` would make, without reading it: read after
 * another hook has suspended, it would not begin until that one had answered.
 */
export function preloadCloses(symbolsKey: string, from: Date | null, to: Date): void {
  const key = keyFor(symbolsKey, from, to)
  if (key) closesResource.preload(key)
}
