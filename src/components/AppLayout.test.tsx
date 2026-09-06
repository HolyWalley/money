import { act, fireEvent, render, screen } from '@testing-library/react'
import { use } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { deferred, type Deferred } from '@/lib/suspense'

vi.mock('@/hooks/useSync', () => ({
  useSync: () => ({ status: { phase: 'idle' }, retry: async () => {} }),
}))
vi.mock('@/hooks/useAppInitialization', () => ({ useAppInitialization: () => {} }))
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))

vi.mock('@/components/savings/SavingsNotificationListener', () => ({
  SavingsNotificationListener: () => null,
}))
vi.mock('@/components/recurring/RecurringGoalLinkSubscriber', () => ({
  RecurringGoalLinkSubscriber: () => null,
}))
vi.mock('@/components/sync/SyncNotificationListener', () => ({
  SyncNotificationListener: () => null,
}))

// The pages are routed by AppRoutes, not by the layout under test.
vi.mock('@/components/Overview', () => ({ Overview: () => null }))
vi.mock('@/components/wallets/WalletsPage', () => ({ WalletsPage: () => null }))
vi.mock('@/components/investments/InvestmentsPage', () => ({ InvestmentsPage: () => null }))
vi.mock('@/components/savings/SavingsPage', () => ({ SavingsPage: () => null }))
vi.mock('@/components/transactions/TransactionsPage', () => ({ TransactionsPage: () => null }))

// The real sidebar brings the transaction drawer and the account menu with
// it; the layout only has to keep it out of the page's boundary. Real items,
// so a navigation goes the way a tap does.
vi.mock('./AppSidebar', async () => {
  const { MenuItem } = await import('./MenuItem')
  return {
    AppSidebar: () => (
      <nav aria-label="Sections">
        <MenuItem to="/first">First</MenuItem>
        <MenuItem to="/second">Second</MenuItem>
        <MenuItem to="/broken">Broken</MenuItem>
      </nav>
    ),
  }
})

const { AppLayout } = await import('./AppRoutes')

let first: Deferred<string>
let second: Deferred<string>
let broken: Deferred<string>

function Page({ source }: { source: Deferred<string> }) {
  return <h1>{use(source.promise)}</h1>
}

function mount(path: string) {
  return act(async () => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <AppLayout>
          <Routes>
            <Route path="/first" element={<Page source={first} />} />
            <Route path="/second" element={<Page source={second} />} />
            <Route path="/broken" element={<Page source={broken} />} />
          </Routes>
        </AppLayout>
      </MemoryRouter>
    )
  })
}

const sidebar = () => screen.getByRole('navigation', { name: 'Sections' })
// The column after the sidebar is where every page renders.
const contentColumn = () => sidebar().nextElementSibling as HTMLElement

describe('AppLayout', () => {
  beforeEach(() => {
    first = deferred<string>()
    second = deferred<string>()
    broken = deferred<string>()
  })

  it('shows the sidebar at once and the fallback only in the content column on a cold start', async () => {
    await mount('/first')

    const loading = screen.getByText('Loading...')
    expect(sidebar()).not.toContainElement(loading)
    expect(contentColumn()).toContainElement(loading)

    await act(async () => first.resolve('First page'))

    expect(screen.getByRole('heading', { name: 'First page' })).toBeVisible()
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })

  it('keeps the current page up while the next one is on its way', async () => {
    first.resolve('First page')
    await mount('/first')
    expect(screen.getByRole('heading', { name: 'First page' })).toBeVisible()

    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'Second' }))
    })

    expect(screen.getByRole('heading', { name: 'First page' })).toBeVisible()
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Second' })).toHaveAttribute('aria-busy', 'true')

    await act(async () => second.resolve('Second page'))

    expect(screen.getByRole('heading', { name: 'Second page' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'First page' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Second' })).not.toHaveAttribute('aria-busy')
  })

  it('shows a failed read in the content column only and leaves it behind on the next navigation', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    broken.reject(new Error('index missing'))
    await mount('/broken')

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('This page could not be read')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(sidebar()).not.toContainElement(alert)
    expect(contentColumn()).toContainElement(alert)

    first.resolve('First page')
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'First' }))
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'First page' })).toBeVisible()
    consoleError.mockRestore()
  })
})
