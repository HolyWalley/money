import { describe, expect, it } from 'vitest'
import { backoffDelayMs, RETRY_DELAYS_MS, SYNC_TIMING } from './backoff'

describe('backoffDelayMs', () => {
  const half = () => 0.5

  it('returns the first delay with no jitter at random 0.5', () => {
    expect(backoffDelayMs(0, { random: half })).toBe(2_000)
  })

  it('walks the curve for attempts 0..3', () => {
    expect([0, 1, 2, 3].map(a => backoffDelayMs(a, { random: half }))).toEqual([...RETRY_DELAYS_MS])
  })

  it('clamps attempts beyond the curve to the last delay', () => {
    expect(backoffDelayMs(4, { random: half })).toBe(54_000)
    expect(backoffDelayMs(99, { random: half })).toBe(54_000)
  })

  it('applies the 0.8 jitter floor at random 0', () => {
    expect(backoffDelayMs(0, { random: () => 0 })).toBe(1_600)
  })

  it('applies the 1.2 jitter ceiling at random 1', () => {
    expect(backoffDelayMs(0, { random: () => 1 })).toBe(2_400)
  })

  it('honours retryAfterMs above the 30s floor', () => {
    expect(backoffDelayMs(0, { retryAfterMs: 45_000, random: half })).toBe(45_000)
  })

  it('raises a small retryAfterMs to the 30s floor', () => {
    expect(backoffDelayMs(0, { retryAfterMs: 1_000, random: half })).toBe(SYNC_TIMING.throttledMinMs)
  })

  it('clamps a huge retryAfterMs to 120s', () => {
    expect(backoffDelayMs(0, { retryAfterMs: 600_000, random: half })).toBe(SYNC_TIMING.throttledMaxMs)
  })
})
