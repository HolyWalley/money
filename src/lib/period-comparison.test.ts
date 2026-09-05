import { describe, it, expect } from 'vitest'
import { percentChange } from './period-comparison'

describe('percentChange', () => {
  it('reports growth as a positive percentage', () => {
    expect(percentChange(120, 100)).toBe(20)
  })

  it('reports a fall as a negative percentage', () => {
    expect(percentChange(75, 100)).toBe(-25)
  })

  it('is zero when nothing moved', () => {
    expect(percentChange(100, 100)).toBe(0)
  })

  // Everything is infinitely more than nothing, so there is no percentage to
  // state and the caller shows the figure without a comparison.
  it('has no answer when the baseline was zero', () => {
    expect(percentChange(100, 0)).toBeNull()
    expect(percentChange(0, 0)).toBeNull()
  })

  // Cash flow is regularly negative, and dividing by a signed baseline would
  // report an improving deficit as a worsening one.
  it('reads the right way round from a negative baseline', () => {
    expect(percentChange(-50, -100)).toBe(50)
    expect(percentChange(-150, -100)).toBe(-50)
  })

  it('handles crossing from a deficit into a surplus', () => {
    expect(percentChange(50, -100)).toBe(150)
  })
})
