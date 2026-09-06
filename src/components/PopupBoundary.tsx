import { Component, Suspense, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { ReadFailure } from './ReadFailure'

interface PopupErrorBoundaryState {
  failed: boolean
}

/**
 * Holds a popup's body, the part that reads the stores: the popup opens at
 * once and spins in place until they answer. A read that fails shows the
 * error inside the popup, because the shell above has no boundary and an
 * uncaught render error unmounts the whole app. No reset key: a closed popup
 * unmounts its content, so every opening starts afresh.
 */
export function PopupBoundary({ children }: { children: ReactNode }) {
  return (
    <PopupErrorBoundary>
      <Suspense fallback={<PopupLoading />}>{children}</Suspense>
    </PopupErrorBoundary>
  )
}

function PopupLoading() {
  return (
    <div role="status" aria-label="Loading" className="flex items-center justify-center p-8">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  )
}

class PopupErrorBoundary extends Component<{ children: ReactNode }, PopupErrorBoundaryState> {
  state: PopupErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): PopupErrorBoundaryState {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) {
      return this.props.children
    }

    return (
      <div className="flex flex-col items-center gap-4 p-4">
        <ReadFailure title="This could not be read" />
      </div>
    )
  }
}
