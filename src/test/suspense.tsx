/* eslint-disable react-refresh/only-export-components */
// Test helpers, never hot-reloaded.
import { Component, Suspense, type ReactElement, type ReactNode } from 'react'
import {
  act,
  render,
  renderHook,
  type RenderHookOptions,
  type RenderHookResult,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react'

export { deferred } from '@/lib/suspense'

export function Suspended({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div data-testid="fallback" />}>{children}</Suspense>
}

interface BoundaryState {
  error: Error | null
}

/**
 * The smallest boundary a test can assert against: the message under
 * `data-testid="boundary"` and a "Retry" button that renders the children again.
 */
export class Boundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div data-testid="boundary">
          {this.state.error.message}
          <button type="button" onClick={() => this.setState({ error: null })}>
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// A tree that suspends inside a synchronous render() is never retried: React
// 19's act queue is orphaned. Mounting inside an awaited act keeps the retry.
export async function mountSuspended(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'queries'>
): Promise<RenderResult> {
  let view!: RenderResult
  await act(async () => {
    view = render(ui, { wrapper: Suspended, ...options })
  })
  return view
}

export async function renderHookSuspended<Result, Props>(
  hook: (initialProps: Props) => Result,
  options?: Omit<RenderHookOptions<Props>, 'queries'>
): Promise<RenderHookResult<Result, Props>> {
  let view!: RenderHookResult<Result, Props>
  await act(async () => {
    view = renderHook(hook, { wrapper: Suspended, ...options })
  })
  return view
}

// Dexie runs a live query's first read on a setTimeout(0).
export function flushLiveQuery(): Promise<void> {
  return act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}
