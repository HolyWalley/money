import { act, render, screen } from '@testing-library/react'
import { use } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { deferred } from '@/lib/suspense'
import { PopupBoundary } from './PopupBoundary'

function Body({ source }: { source: Promise<string> }) {
  return <p>{use(source)}</p>
}

describe('PopupBoundary', () => {
  it('spins in place until the body answers', async () => {
    const answer = deferred<string>()

    await act(async () => {
      render(
        <PopupBoundary>
          <Body source={answer.promise} />
        </PopupBoundary>
      )
    })

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    expect(screen.queryByText('Wallets')).not.toBeInTheDocument()

    await act(async () => answer.resolve('Wallets'))

    expect(screen.getByText('Wallets')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  // The shell has no boundary of its own: a read that failed here would
  // otherwise unmount the whole app.
  it('shows a failed read inside the popup, with a way to reload', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const answer = deferred<string>()
    answer.reject(new Error('index missing'))

    await act(async () => {
      render(
        <div data-testid="popup">
          <PopupBoundary>
            <Body source={answer.promise} />
          </PopupBoundary>
        </div>
      )
    })

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('This could not be read')
    expect(screen.getByTestId('popup')).toContainElement(alert)
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    consoleError.mockRestore()
  })
})
