import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StatDelta } from './StatDelta'

function renderDelta(current: number, previous: number, goodDirection: 'up' | 'down' = 'up') {
  const { container } = render(
    <StatDelta
      current={current}
      previous={previous}
      goodDirection={goodDirection}
      baseCurrency="EUR"
    />
  )
  return container
}

describe('StatDelta', () => {
  it('states the change as a whole percentage', () => {
    renderDelta(2240, 2000)

    expect(screen.getByText('12%')).toBeInTheDocument()
  })

  it('drops the sign from the text and leaves it to the arrow', () => {
    renderDelta(1600, 2000)

    expect(screen.getByText('20%')).toBeInTheDocument()
  })

  it('says so plainly when nothing moved', () => {
    renderDelta(2000, 2000)

    expect(screen.getByText('flat')).toBeInTheDocument()
  })

  it('treats a change too small to round as flat', () => {
    renderDelta(2000.4, 2000)

    expect(screen.getByText('flat')).toBeInTheDocument()
  })

  // Nothing is infinitely more than nothing, so there is no percentage to state.
  it('renders nothing at all without a baseline to compare against', () => {
    const container = renderDelta(2400, 0)

    expect(container).toBeEmptyDOMElement()
  })

  it('reads more income as good news', () => {
    const container = renderDelta(2400, 2000, 'up')

    expect(container.querySelector('.text-green-600')).not.toBeNull()
  })

  // The same arrow means opposite things on the two figures it sits beneath.
  it('reads more spending as bad news', () => {
    const container = renderDelta(2400, 2000, 'down')

    expect(container.querySelector('.text-red-600')).not.toBeNull()
  })

  it('reads less spending as good news', () => {
    const container = renderDelta(1600, 2000, 'down')

    expect(container.querySelector('.text-green-600')).not.toBeNull()
  })

  it('puts the figure it is comparing against within reach', () => {
    renderDelta(2400, 2000)

    expect(screen.getByTitle('Previous period: 2,000.00 EUR')).toBeInTheDocument()
  })
})
