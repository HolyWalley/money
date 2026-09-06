import { Component, type ReactNode } from 'react'
import { ReadFailure } from './ReadFailure'

interface PageErrorBoundaryProps {
  /** A change renders the children again: the pathname, so a navigation leaves a failed page behind. */
  resetKey: string
  children: ReactNode
}

interface PageErrorBoundaryState {
  failed: boolean
  resetKey: string
}

/** Catches a page whose data could not be read. */
export class PageErrorBoundary extends Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  state: PageErrorBoundaryState = { failed: false, resetKey: this.props.resetKey }

  static getDerivedStateFromError(): Partial<PageErrorBoundaryState> {
    return { failed: true }
  }

  // Reset here rather than in an effect: this runs in the same render as the
  // navigation, inside the router's transition, so the next page is never
  // held behind the failed one's message.
  static getDerivedStateFromProps(
    props: PageErrorBoundaryProps,
    state: PageErrorBoundaryState
  ): Partial<PageErrorBoundaryState> | null {
    if (props.resetKey === state.resetKey) return null
    return { failed: false, resetKey: props.resetKey }
  }

  render() {
    if (!this.state.failed) {
      return this.props.children
    }

    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-4">
        <ReadFailure title="This page could not be read" />
      </div>
    )
  }
}
