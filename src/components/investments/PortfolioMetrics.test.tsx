import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PortfolioMetrics } from './PortfolioMetrics'
import type { HistoryPoint } from '@/lib/portfolio-history'

function point(overrides: Partial<HistoryPoint> & { date: string }): HistoryPoint {
  return {
    value: 12500,
    invested: 10000,
    gain: 2500,
    flow: 0,
    realised: 0,
    performance: 0.25,
    ...overrides,
  }
}

/**
 * `days` of alternating up and down moves of `swing`, so the spread is a figure
 * a test can name: a series that steps ±1% every day has a daily standard
 * deviation of about 1%, which over 365 calendar days is 19.2%.
 */
function swinging(days: number, swing = 0.01): HistoryPoint[] {
  let index = 1

  return Array.from({ length: days }, (_, day) => {
    index *= day % 2 === 0 ? 1 + swing : 1 / (1 + swing)
    return point({
      date: new Date(Date.UTC(2025, 0, 1 + day)).toISOString().split('T')[0],
      value: 10000 * index,
      performance: index - 1,
    })
  })
}

function renderMetrics(window: HistoryPoint[], hasSales = false) {
  return render(<PortfolioMetrics window={window} hasSales={hasSales} baseCurrency="PLN" />)
}

/** The value of the tile with this label, whatever it is called elsewhere. */
function tile(label: string): string {
  return screen.getByText(label).nextElementSibling?.textContent ?? ''
}

describe('PortfolioMetrics', () => {
  it('states what was paid for what is held, in the base currency', () => {
    renderMetrics(swinging(40))

    expect(tile('Invested')).toContain('10,000.00')
    expect(tile('Invested')).toContain('PLN')
  })

  it('states the return of the window, time-weighted', () => {
    renderMetrics([...swinging(39), point({ date: '2025-02-20', performance: 0.183 })])

    expect(tile('Time-weighted return')).toBe('+18.3%')
  })

  // A spread has no direction, so it carries no sign and no colour: a portfolio
  // that moves a lot is not thereby doing well or badly.
  it('states the spread of the daily return as a yearly figure, unsigned', () => {
    renderMetrics(swinging(60))

    // About 1% a day, annualised over 365 calendar days.
    expect(tile('Volatility')).toBe('19.2%')
  })

  // Three days of a portfolio say nothing about how much it moves, and a figure
  // stated from them would be read as though they did.
  it('says nothing about the spread of a window too short to measure', () => {
    renderMetrics(swinging(5))

    expect(tile('Volatility')).toBe('—')
  })

  // Every day of the window, so a sale on its first day belongs to it.
  it('adds up what the window sold for over what it cost', () => {
    renderMetrics(
      [
        point({ date: '2025-01-01', realised: 400 }),
        point({ date: '2025-01-02' }),
        point({ date: '2025-01-03', realised: -150 }),
      ],
      true
    )

    expect(tile('Realised')).toContain('+250.00')
  })

  // A tile reading 0.00 for ever is worse than no tile at all, and it must not
  // appear and vanish as the periods are pressed - so the question is asked of
  // the whole history, not of the window.
  it('leaves out the realised tile for a portfolio that has never sold', () => {
    renderMetrics(swinging(40))

    expect(screen.queryByText('Realised')).not.toBeInTheDocument()
  })

  it('keeps the realised tile through a window that happens to hold no sale', () => {
    renderMetrics(swinging(40), true)

    expect(tile('Realised')).toContain('0.00')
  })

  it('states nothing at all where there is no window', () => {
    const { container } = renderMetrics([])

    expect(container).toBeEmptyDOMElement()
  })
})
