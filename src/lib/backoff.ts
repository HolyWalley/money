export const RETRY_DELAYS_MS = [2_000, 6_000, 18_000, 54_000] as const

export const SYNC_TIMING = {
  pushDebounceMs: 1_500,
  pushMaxWaitMs: 5_000,
  pullMinIntervalMs: 30_000,
  pushBatchMaxRows: 500,
  pushBatchMaxBytes: 1_000_000,
  maxAttempts: 5,
  throttledMinMs: 30_000,
  throttledMaxMs: 120_000,
} as const

export function backoffDelayMs(
  attempt: number,
  opts: { retryAfterMs?: number; random?: () => number } = {},
): number {
  const random = opts.random ?? Math.random

  if (opts.retryAfterMs !== undefined) {
    return Math.min(Math.max(opts.retryAfterMs, SYNC_TIMING.throttledMinMs), SYNC_TIMING.throttledMaxMs)
  }

  const base = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]
  return Math.round(base * (0.8 + random() * 0.4))
}
