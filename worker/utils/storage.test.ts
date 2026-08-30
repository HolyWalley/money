import { describe, it, expect, beforeEach, vi } from 'vitest'
import { StorageUtils } from './storage'
import type { UserRecord } from './storage'

type Env = Parameters<typeof StorageUtils.readUserByUsername>[1]

const record: UserRecord = {
  userId: 'u1',
  username: 'bob',
  passwordHash: 'hash',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  isActive: true,
  premium: { active: false },
  settings: { defaultCurrency: 'USD' },
}

const envReturning = (value: string | null): Env => ({
  MONEY_USER_AUTH: { get: vi.fn().mockResolvedValue(value) },
} as unknown as Env)

const envRejecting = (error: unknown): Env => ({
  MONEY_USER_AUTH: { get: vi.fn().mockRejectedValue(error) },
} as unknown as Env)

describe('StorageUtils.readUserByUsername', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns the record for a well-formed entry', async () => {
    const env = envReturning(JSON.stringify(record))

    await expect(StorageUtils.readUserByUsername('Bob', env))
      .resolves.toEqual({ status: 'found', value: record })
    expect(env.MONEY_USER_AUTH.get).toHaveBeenCalledWith('user:bob')
  })

  it('accepts an older record that predates premium and settings', async () => {
    const legacy = { userId: 'u1', username: 'bob', passwordHash: 'h', isActive: true }
    const read = await StorageUtils.readUserByUsername('bob', envReturning(JSON.stringify(legacy)))

    expect(read.status).toBe('found')
  })

  it('returns not-found for a missing key', async () => {
    await expect(StorageUtils.readUserByUsername('bob', envReturning(null)))
      .resolves.toEqual({ status: 'not-found' })
  })

  it('reports a KV transport failure as a retryable read error', async () => {
    const failure = new Error('KV unavailable')

    await expect(StorageUtils.readUserByUsername('bob', envRejecting(failure)))
      .resolves.toEqual({ status: 'error', reason: 'read', error: failure })
  })

  it.each([
    ['malformed JSON', 'not json at all'],
    ['a JSON null', 'null'],
    ['a JSON scalar', '"bob"'],
    ['an object with no identity fields', '{}'],
    ['an object whose userId is not a string', '{"userId":42,"username":"bob"}'],
  ])('reports %s as a corrupt record, distinct from a read failure', async (_name, stored) => {
    const read = await StorageUtils.readUserByUsername('bob', envReturning(stored))

    expect(read.status).toBe('error')
    expect(read).toMatchObject({ reason: 'corrupt' })
  })

  it('names the offending key in the log so an operator can find it', async () => {
    await StorageUtils.readUserByUsername('Bob', envReturning('{'))

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('user:bob'),
      expect.anything()
    )
  })

  it('never reports a corrupt record as not-found, which callers answer with a 401', async () => {
    const read = await StorageUtils.readUserByUsername('bob', envReturning('{'))

    expect(read.status).not.toBe('not-found')
    expect(read.status).not.toBe('found')
  })
})

describe('StorageUtils.getUserByUsername', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns the record when it is readable', async () => {
    await expect(StorageUtils.getUserByUsername('bob', envReturning(JSON.stringify(record))))
      .resolves.toEqual(record)
  })

  it.each([
    ['a corrupt record', envReturning('{')],
    ['a read failure', envRejecting(new Error('KV unavailable'))],
    ['a missing key', envReturning(null)],
  ])('returns null for %s', async (_name, env) => {
    await expect(StorageUtils.getUserByUsername('bob', env)).resolves.toBeNull()
  })
})
