import { use } from 'react'
import { renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { NONE, deferred, settled } from './suspense'

describe('deferred', () => {
  it('starts pending and stamps the value on resolve', async () => {
    const d = deferred<number>()

    expect(d.promise.status).toBe('pending')
    expect(d.promise.value).toBeUndefined()

    d.resolve(7)

    expect(d.promise.status).toBe('fulfilled')
    expect(d.promise.value).toBe(7)
    await expect(d.promise).resolves.toBe(7)
  })

  // The rejected promise is left unobserved on purpose: vitest fails the run on
  // an unhandled rejection, so this passing is the proof that reject() handles it.
  it('stamps the reason on reject without an unhandled rejection', () => {
    const d = deferred<number>()
    const reason = new Error('no')

    d.reject(reason)

    expect(d.promise.status).toBe('rejected')
    expect(d.promise.reason).toBe(reason)
  })

  it('settles once', async () => {
    const d = deferred<number>()

    d.resolve(1)
    d.reject(new Error('late'))
    d.resolve(2)

    expect(d.promise.status).toBe('fulfilled')
    expect(d.promise.value).toBe(1)
    await expect(d.promise).resolves.toBe(1)
  })
})

describe('settled', () => {
  it('is fulfilled with the value from the start', async () => {
    const promise = settled('ready')

    expect(promise.status).toBe('fulfilled')
    expect(promise.value).toBe('ready')
    await expect(promise).resolves.toBe('ready')
  })

  it('is read by use() without suspending', () => {
    const { result } = renderHook(() => use(settled(3)))

    expect(result.current).toBe(3)
  })
})

describe('NONE', () => {
  it('is nothing a querier could return', () => {
    expect(typeof NONE).toBe('symbol')
    expect(NONE).not.toBe(undefined)
    expect(NONE).not.toBe(null)
  })
})
