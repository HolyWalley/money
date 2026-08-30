import type { ConnectionState } from './network-status'

export interface AuthConnectionCopy {
  title: string
  description: string
  /** One line, shown under the submit button. */
  note: string
}

/**
 * Null when there is nothing worth saying.
 *
 * 'unreachable' must never claim the user is offline and must never tell them to
 * wait: navigator.onLine is true, no DOM 'online' event will ever fire, and the only
 * thing that clears the state is a successful request — so the attempt we would be
 * discouraging is the sole exit.
 */
export function describeAuthConnection(connection: ConnectionState): AuthConnectionCopy | null {
  switch (connection) {
    case 'offline':
      return {
        title: "You're offline",
        description: "Sign in once you're back online.",
        note: "You're offline",
      }
    case 'unreachable':
      return {
        title: "Can't reach the server",
        description: 'Your device is online but the server did not answer. Try again.',
        note: "Can't reach the server — you can still try",
      }
    default:
      return null
  }
}
