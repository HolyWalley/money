import { describe, it, expect } from 'vitest'
import { describeAuthConnection } from './auth-connection-copy'

describe('describeAuthConnection', () => {
  it('says nothing while the connection is healthy', () => {
    expect(describeAuthConnection('online')).toBeNull()
  })

  it('tells a genuinely offline user to wait, because that state self-clears', () => {
    expect(describeAuthConnection('offline')).toEqual({
      title: "You're offline",
      description: "Sign in once you're back online.",
      note: "You're offline",
    })
  })

  it('never claims an unreachable user is offline', () => {
    const copy = describeAuthConnection('unreachable')

    expect(copy?.title).toBe("Can't reach the server")
    expect(copy?.title).not.toContain('offline')
    expect(copy?.description).not.toContain('offline')
    expect(copy?.note).not.toContain('offline')
  })

  it('invites an unreachable user to retry rather than to wait', () => {
    const copy = describeAuthConnection('unreachable')

    expect(copy?.description).toContain('Try again')
    expect(copy?.note).toContain('try')
  })
})
