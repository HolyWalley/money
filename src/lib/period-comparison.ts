/**
 * Change from `previous` to `current` as a percentage, or null when there is no
 * percentage to state: everything is infinitely more than nothing.
 *
 * The denominator is the magnitude of the previous value so that a negative
 * baseline still reads the right way round - a cash flow going from -100 to
 * -50 improved by 50%, it did not worsen by it.
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return null
  }

  return ((current - previous) / Math.abs(previous)) * 100
}
