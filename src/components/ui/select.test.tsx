import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Select, SelectTrigger, SelectValue } from './select'

// Base UI renders the raw value in the trigger unless the Select can map it to
// a label, which is what `items` is for. Without it a wallet select shows a
// bare uuid instead of the wallet name.
describe('Select trigger label', () => {
  it('shows the item label for the selected value, not the raw value', () => {
    render(
      <Select
        items={[{ value: '153d68b3-e5b4-4840-84c4-e392a872aba6', label: 'rand8 (USD)' }]}
        value="153d68b3-e5b4-4840-84c4-e392a872aba6"
      >
        <SelectTrigger>
          <SelectValue placeholder="Select wallet" />
        </SelectTrigger>
      </Select>
    )

    expect(screen.getByText('rand8 (USD)')).toBeInTheDocument()
    expect(screen.queryByText('153d68b3-e5b4-4840-84c4-e392a872aba6')).not.toBeInTheDocument()
  })

  it('falls back to the placeholder when nothing is selected', () => {
    render(
      <Select items={[{ value: 'w1', label: 'rand8 (USD)' }]} value="">
        <SelectTrigger>
          <SelectValue placeholder="Select wallet" />
        </SelectTrigger>
      </Select>
    )

    expect(screen.getByText('Select wallet')).toBeInTheDocument()
  })
})
