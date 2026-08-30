import type { ApiFailure } from './api-client'

export function describeAuthError(r: { failure?: ApiFailure; error?: string; status: number }): string {
  switch (r.failure) {
    case 'network':
      return "Can't reach the server. Check your connection and try again."
    case 'timeout':
      return 'The server took too long to answer. Try again.'
    case 'server':
      return r.status === 429
        ? 'Too many attempts. Wait a minute and try again.'
        : 'The server is having trouble. Try again in a moment.'
    // An HTML body on a 2xx is the captive-portal signature, not a server bug.
    case 'parse':
      return 'Got an unexpected response. If you are on public Wi-Fi, you may need to sign in to the network first.'
    default:
      return r.error || 'Something went wrong. Try again.'
  }
}
