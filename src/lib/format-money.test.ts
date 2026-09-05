import { describe, it, expect } from 'vitest'
import { formatMoney, formatSignedMoney } from './format-money'

describe('formatMoney', () => {
  it('always shows two decimal places', () => {
    expect(formatMoney(12)).toBe('12.00')
    expect(formatMoney(12.5)).toBe('12.50')
  })

  it('groups thousands', () => {
    expect(formatMoney(12480.3)).toBe('12,480.30')
    expect(formatMoney(1234567.89)).toBe('1,234,567.89')
  })

  it('keeps the minus sign on a negative amount', () => {
    expect(formatMoney(-1234.5)).toBe('-1,234.50')
  })

  it('rounds to the nearest cent', () => {
    expect(formatMoney(1.005)).toBe('1.01')
  })

  // A total that rounds a hair below zero would otherwise print "-0.00", which
  // reads as owing money.
  it('does not print a negative zero', () => {
    expect(formatMoney(-0.0001)).toBe('0.00')
  })
})

describe('formatSignedMoney', () => {
  it('marks a gain with a plus', () => {
    expect(formatSignedMoney(2800)).toBe('+2,800.00')
  })

  it('leaves the minus sign to do the work on a loss', () => {
    expect(formatSignedMoney(-150.25)).toBe('-150.25')
  })

  it('gives zero no sign at all', () => {
    expect(formatSignedMoney(0)).toBe('0.00')
    expect(formatSignedMoney(-0.001)).toBe('0.00')
  })
})
