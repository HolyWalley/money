import { describe, expect, it } from 'vitest'
import { InboxAddress } from './address'

describe('InboxAddress', () => {
  it('generates tokens it recognises, different every time', () => {
    const first = InboxAddress.generateToken()
    const second = InboxAddress.generateToken()

    expect(first).toHaveLength(16)
    expect(first).not.toBe(second)
    expect(InboxAddress.tokenOf(InboxAddress.format(first, 'in.example.com'))).toBe(first)
  })

  it('reads the token whatever the case of the recipient', () => {
    expect(InboxAddress.tokenOf('ABCDEFGHJKMNPQRS@in.example.com')).toBe('abcdefghjkmnpqrs')
  })

  it('refuses a local part that cannot be a token', () => {
    expect(InboxAddress.tokenOf('postmaster@in.example.com')).toBeNull()
    expect(InboxAddress.tokenOf('abcdefghjkmnpqr0@in.example.com')).toBeNull()
    expect(InboxAddress.tokenOf('')).toBeNull()
  })
})
