import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { SyncStatusDot } from './SyncStatusDot'
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

function renderDot(overrides: Partial<SyncStatus> = {}) {
  const { container } = render(<SyncStatusDot status={makeStatus(overrides)} />)
  return container.firstElementChild
}

describe('SyncStatusDot', () => {
  it('renders nothing for disabled', () => {
    expect(renderDot({ phase: 'disabled' })).toBeNull()
  })

  it('renders nothing for idle', () => {
    expect(renderDot({ phase: 'idle', lastSyncedAt: 1_700_000_000_000 })).toBeNull()
  })

  it('renders for idle with a pending count', () => {
    expect(renderDot({ phase: 'pending', pendingCount: 2 })).not.toBeNull()
  })

  it('exposes an accessible label for offline with pending changes', () => {
    render(<SyncStatusDot status={makeStatus({ phase: 'offline', pendingCount: 3 })} />)

    expect(screen.getByText('Offline, 3 changes pending')).toBeInTheDocument()
  })

  it('carries the attention colour when offline', () => {
    expect(renderDot({ phase: 'offline', pendingCount: 3 })?.className).toContain('bg-amber-500')
  })

  it('carries the danger colour on error', () => {
    expect(renderDot({ phase: 'error', pendingCount: 1 })?.className).toContain('bg-destructive')
  })

  it('animates only while syncing', () => {
    expect(renderDot({ phase: 'syncing', pendingCount: 1 })?.className).toContain('animate-pulse')
    expect(renderDot({ phase: 'pending', pendingCount: 1 })?.className).not.toContain('animate-pulse')
  })
})
