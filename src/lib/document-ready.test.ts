import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { deferred } from './suspense'

const crdt = vi.hoisted(() => ({ ready: Promise.resolve() as Promise<unknown> }))

vi.mock('./crdts', () => ({
  get crdtReady() {
    return crdt.ready
  },
}))

// `documentReady` is made once per module, so each case loads a fresh copy of
// it together with the restore flag it watches.
async function load() {
  vi.resetModules()
  const [{ documentReady }, restore] = await Promise.all([
    import('./document-ready'),
    import('./pending-restore'),
  ])
  return { documentReady, ...restore }
}

function isSettled(promise: Promise<unknown>): Promise<boolean> {
  return Promise.race([
    promise.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 0)),
  ])
}

describe('documentReady', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('waits for crdtReady', async () => {
    const gate = deferred<unknown>()
    crdt.ready = gate.promise
    const { documentReady } = await load()

    expect(await isSettled(documentReady)).toBe(false)

    gate.resolve(undefined)

    await expect(documentReady).resolves.toBeUndefined()
  })

  it('waits out a pending restore', async () => {
    const gate = deferred<unknown>()
    crdt.ready = gate.promise
    const { documentReady, beginRestore, awaitRestoredData, endRestore } = await load()

    beginRestore()
    gate.resolve(undefined)

    expect(await isSettled(documentReady)).toBe(false)

    awaitRestoredData()

    expect(await isSettled(documentReady)).toBe(false)

    endRestore()

    await expect(documentReady).resolves.toBeUndefined()
  })
})
