import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AppSidebarMobile } from './AppSidebarMobile'

// Both bring the whole transaction and auth stack with them; the bar only has
// to place them.
vi.mock('./transactions/NewTransactionTrigger', () => ({
  NewTransactionTrigger: () => <button type="button">Add a transaction</button>,
}))

vi.mock('@/components/UserDropdownMenu', () => ({
  UserDropdownMenu: () => <button type="button">Account menu</button>,
}))

describe('AppSidebarMobile', () => {
  it('reaches every section of the app, investments included', () => {
    render(
      <MemoryRouter>
        <AppSidebarMobile />
      </MemoryRouter>
    )

    const destinations = screen.getAllByRole('link').map(link => [
      link.textContent,
      link.getAttribute('href'),
    ])

    // Cash first, then what it is being put towards, then the markets.
    expect(destinations).toEqual([
      ['Overview', '/dashboard'],
      ['Log', '/transactions'],
      ['Invest', '/investments'],
      ['Savings', '/savings'],
    ])
    expect(screen.getByRole('button', { name: 'Add a transaction' })).toBeInTheDocument()
    expect(screen.getByText('Me')).toBeInTheDocument()
  })

  it('marks the section being viewed', () => {
    render(
      <MemoryRouter initialEntries={['/investments']}>
        <AppSidebarMobile />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: 'Invest' })).toHaveClass('bg-muted')
    expect(screen.getByRole('link', { name: 'Savings' })).not.toHaveClass('bg-muted')
  })
})
