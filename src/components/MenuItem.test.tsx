import { act, fireEvent, render, screen } from '@testing-library/react'
import { Suspense, use } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { deferred, type Deferred } from '@/lib/suspense'
import { MenuItem } from './MenuItem'

let slowPage: Deferred<string>

function Home() {
  return <h1>Home</h1>
}

function Slow() {
  return <h1>{use(slowPage.promise)}</h1>
}

function mount() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <nav>
        <MenuItem to="/">Home</MenuItem>
        <MenuItem to="/slow">Slow</MenuItem>
      </nav>
      <Suspense fallback={<div data-testid="fallback" />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/slow" element={<Slow />} />
        </Routes>
      </Suspense>
    </MemoryRouter>
  )
}

describe('MenuItem', () => {
  beforeEach(() => {
    slowPage = deferred<string>()
  })

  it('navigates on a plain click and is busy until the page is in', async () => {
    mount()
    const link = screen.getByRole('link', { name: 'Slow' })

    await act(async () => {
      fireEvent.click(link)
    })

    expect(link).toHaveAttribute('aria-busy', 'true')
    expect(link).toHaveClass('opacity-60')
    expect(screen.getByRole('heading', { name: 'Home' })).toBeVisible()
    expect(screen.queryByTestId('fallback')).not.toBeInTheDocument()

    await act(async () => slowPage.resolve('Slow page'))

    expect(screen.getByRole('heading', { name: 'Slow page' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Home' })).not.toBeInTheDocument()
    expect(link).not.toHaveAttribute('aria-busy')
    expect(link).toHaveAttribute('aria-current', 'page')
    expect(link).toHaveClass('bg-muted')
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })

  it('leaves a modified click to the browser', async () => {
    // jsdom takes the click and reports, on a timer, the navigation it
    // cannot perform; that report is the browser's business, not the item's.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mount()
    const link = screen.getByRole('link', { name: 'Slow' })

    let defaultKept = false
    act(() => {
      defaultKept = fireEvent.click(link, { metaKey: true })
    })

    // Checked before anything else runs: a transition started for this click
    // would already have painted the item busy for a frame.
    expect(defaultKept).toBe(true)
    expect(link).not.toHaveAttribute('aria-busy')
    expect(link).not.toHaveClass('opacity-60')

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(link).not.toHaveAttribute('aria-busy')
    consoleError.mockRestore()
  })
})
