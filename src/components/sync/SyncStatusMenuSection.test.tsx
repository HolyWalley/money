import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SyncStatusMenuSection } from './SyncStatusMenuSection'
import type { SyncStatus } from '@/lib/sync-status'

function makeStatus(overrides: Partial<SyncStatus> = {}): SyncStatus {
  return {
    phase: 'idle',
    pendingCount: 0,
    unqueuedCount: 0,
    lastSyncedAt: null,
    nextRetryAt: null,
    attempt: 0,
    maxAttempts: 5,
    ...overrides,
  }
}

function renderSection(overrides: Partial<SyncStatus> = {}) {
  const onRetry = vi.fn()
  const onSignIn = vi.fn()
  const result = render(
    <SyncStatusMenuSection status={makeStatus(overrides)} onRetry={onRetry} onSignIn={onSignIn} />,
  )
  return { ...result, onRetry, onSignIn }
}

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
})

describe('SyncStatusMenuSection', () => {
  it('renders null for disabled', () => {
    const { container } = renderSection({ phase: 'disabled' })

    expect(container).toBeEmptyDOMElement()
  })

  it('renders the offline title and detail', () => {
    renderSection({ phase: 'offline', pendingCount: 3 })

    expect(screen.getByText('3 changes saved on this device')).toBeInTheDocument()
    expect(screen.getByText("They'll sync when you're back online.")).toBeInTheDocument()
  })

  it('renders no action button when offline', () => {
    renderSection({ phase: 'offline', pendingCount: 3 })

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders the last-synced line when idle', () => {
    renderSection({ phase: 'idle', lastSyncedAt: Date.now() - 2 * 60_000 })

    expect(screen.getByText('All changes synced')).toBeInTheDocument()
    expect(screen.getByText('Last synced 2m ago')).toBeInTheDocument()
  })

  it('clicking Sync now calls onRetry once', async () => {
    const user = userEvent.setup()
    const { onRetry, onSignIn } = renderSection({ phase: 'pending', pendingCount: 2 })

    await user.click(screen.getByRole('button', { name: 'Sync now' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onSignIn).not.toHaveBeenCalled()
  })

  it('offers no Sync now button while syncing', () => {
    renderSection({ phase: 'syncing', pendingCount: 2 })

    expect(screen.getByText('Syncing…')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders Sign in for unauthenticated and clicking it calls onSignIn and not onRetry', async () => {
    const user = userEvent.setup()
    const { onRetry, onSignIn } = renderSection({ phase: 'unauthenticated', pendingCount: 1 })

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(onSignIn).toHaveBeenCalledTimes(1)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('renders the error title and the safe-on-this-device detail', () => {
    renderSection({ phase: 'error', pendingCount: 3 })

    expect(screen.getByText("Couldn't sync")).toBeInTheDocument()
    expect(screen.getByText('3 changes are safe on this device.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
