import { describe, it, expect } from 'vitest'
import { describeAuthError } from './auth-error-copy'

describe('describeAuthError', () => {
  it('describes a network failure', () => {
    expect(describeAuthError({ failure: 'network', status: 0 })).toBe(
      "Can't reach the server. Check your connection and try again."
    )
  })

  it('describes a timeout', () => {
    expect(describeAuthError({ failure: 'timeout', status: 0 })).toBe(
      'The server took too long to answer. Try again.'
    )
  })

  it('describes a 429 as too many attempts', () => {
    expect(describeAuthError({ failure: 'server', status: 429 })).toBe(
      'Too many attempts. Wait a minute and try again.'
    )
  })

  it('describes a non-429 server failure', () => {
    expect(describeAuthError({ failure: 'server', status: 522 })).toBe(
      'The server is having trouble. Try again in a moment.'
    )
  })

  it('describes a parse failure as a possible captive portal', () => {
    expect(describeAuthError({ failure: 'parse', status: 200 })).toBe(
      'Got an unexpected response. If you are on public Wi-Fi, you may need to sign in to the network first.'
    )
  })

  it('falls through to the server message for an auth failure', () => {
    expect(describeAuthError({ failure: 'auth', status: 401, error: 'Invalid credentials' })).toBe(
      'Invalid credentials'
    )
  })

  it('falls through to a generic message when there is no error string', () => {
    expect(describeAuthError({ failure: 'client', status: 400 })).toBe(
      'Something went wrong. Try again.'
    )
  })
})
