import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CashflowTrendChart } from './CashflowTrendChart'
import type { TrendPoint } from '@/hooks/usePeriodTrend'

function point(year: number, month: number, income: number, expense: number): TrendPoint {
  return {
    period: {
      start: new Date(year, month - 1, 1),
      end: new Date(year, month, 0, 23, 59, 59),
    },
    income,
    expense,
  }
}

describe('CashflowTrendChart', () => {
  const points = [
    point(2026, 7, 3000, 2100),
    point(2026, 8, 3000, 2450),
    point(2026, 9, 3200, 1980),
  ]

  it('renders under a heading naming what is being compared', () => {
    render(<CashflowTrendChart points={points} periodType="monthly" baseCurrency="EUR" />)

    expect(screen.getByText('Income vs expense')).toBeInTheDocument()
  })

  it('survives a period with nothing in it', () => {
    render(<CashflowTrendChart points={[]} periodType="monthly" baseCurrency="EUR" />)

    expect(screen.getByText('Income vs expense')).toBeInTheDocument()
  })
})
