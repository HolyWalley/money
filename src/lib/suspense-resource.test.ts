import { createElement, useState } from 'react'
import { render, renderHook, act, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Boundary, Suspended, deferred, mountSuspended, renderHookSuspended } from '@/test/suspense'
import { NONE, type Deferred } from './suspense'
import { reportRequestOutcome, resetNetworkStatus } from './network-status'
import {
  createResource,
  resetResources,
  useResource,
  IDLE_ENTRIES_RETAINED,
  RETRY_AFTER_FAILURE_MS,
  type CacheAnswer,
  type LoadAnswer,
  type Resource,
  type ResourceSource,
} from './suspense-resource'

type Rates = Map<string, number>

const REVALIDATE_AFTER_MS = 60 * 60 * 1000

const rates = (entries: Record<string, number>): Rates => new Map(Object.entries(entries))

// Union, next wins; the same Map back when nothing changed.
function union(previous: Rates, next: Rates): Rates {
  const changed = [...next].some(([currency, rate]) => previous.get(currency) !== rate)
  return changed ? new Map([...previous, ...next]) : previous
}

function createSource() {
  const cacheReads: Deferred<CacheAnswer<Rates>>[] = []
  const loads: Deferred<LoadAnswer<Rates>>[] = []
  const source: ResourceSource<Rates> = {
    fromCache: vi.fn(() => {
      const read = deferred<CacheAnswer<Rates>>()
      cacheReads.push(read)
      return read.promise
    }),
    load: vi.fn(() => {
      const load = deferred<LoadAnswer<Rates>>()
      loads.push(load)
      return load.promise
    }),
    merge: union,
    revalidateAfterMs: REVALIDATE_AFTER_MS,
  }
  return { source, cacheReads, loads }
}

const cached = (value: Rates, stale = false): CacheAnswer<Rates> => ({ value, answers: true, stale })
const unanswered = (): CacheAnswer<Rates> => ({ value: new Map(), answers: false, stale: true })
const loaded = (value: Rates, complete = true): LoadAnswer<Rates> => ({ value, complete })

function Rates({ resource, rateKey }: { resource: Resource<Rates>; rateKey: string | null }) {
  const value = useResource(resource, rateKey)
  const text = value ? [...value].map(([currency, rate]) => `${currency}=${rate}`).join(',') : 'none'
  return createElement('div', { 'data-testid': 'rates' }, text)
}

// A fresh element each time: React skips a child handed the same element object.
const reader = (resource: Resource<Rates>) => createElement(Rates, { resource, rateKey: 'USD' })

function Switcher({ resource }: { resource: Resource<Rates> }) {
  const [rateKey, setRateKey] = useState('USD')
  return createElement(
    'div',
    null,
    createElement(Rates, { resource, rateKey }),
    createElement('button', { type: 'button', onClick: () => setRateKey('PLN') }, 'PLN')
  )
}

describe('createResource', () => {
  beforeEach(() => {
    resetResources()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    resetNetworkStatus()
  })

  it('answers from the cache without waiting for the network', async () => {
    const { source, cacheReads } = createSource()
    const resource = createResource(source)

    await mountSuspended(createElement(Rates, { resource, rateKey: 'USD' }))

    expect(screen.getByTestId('fallback')).toBeInTheDocument()
    expect(source.fromCache).toHaveBeenCalledWith('USD')

    await act(async () => {
      cacheReads[0].resolve(cached(rates({ EUR: 0.9 })))
    })

    expect(screen.queryByTestId('fallback')).toBeNull()
    expect(screen.getByTestId('rates')).toHaveTextContent('EUR=0.9')
    expect(source.load).not.toHaveBeenCalled()
  })

  it('suspends until the network answers when the cache cannot', async () => {
    const { source, cacheReads, loads } = createSource()
    const resource = createResource(source)

    await mountSuspended(createElement(Rates, { resource, rateKey: 'USD' }))
    await act(async () => {
      cacheReads[0].resolve(unanswered())
    })

    expect(screen.getByTestId('fallback')).toBeInTheDocument()
    expect(source.load).toHaveBeenCalledWith('USD')

    await act(async () => {
      loads[0].resolve(loaded(rates({ EUR: 0.9 })))
    })

    expect(screen.queryByTestId('fallback')).toBeNull()
    expect(screen.getByTestId('rates')).toHaveTextContent('EUR=0.9')
  })

  it('never suspends a reader once the entry has answered', async () => {
    const { source, cacheReads } = createSource()
    const resource = createResource(source)

    const first = await mountSuspended(createElement(Rates, { resource, rateKey: 'USD' }))
    await act(async () => {
      cacheReads[0].resolve(cached(rates({ EUR: 0.9 })))
    })
    first.unmount()

    // A synchronous render: had it suspended, the fallback would be all that is
    // on screen.
    render(createElement(Rates, { resource, rateKey: 'USD' }), { wrapper: Suspended })

    expect(screen.queryByTestId('fallback')).toBeNull()
    expect(screen.getByTestId('rates')).toHaveTextContent('EUR=0.9')
    expect(source.fromCache).toHaveBeenCalledTimes(1)
  })

  it('refreshes a stale answer behind the render and never shrinks it', async () => {
    const { source, cacheReads, loads } = createSource()
    const resource = createResource(source)

    await mountSuspended(createElement(Rates, { resource, rateKey: 'USD' }))
    await act(async () => {
      cacheReads[0].resolve(cached(rates({ EUR: 0.9 }), true))
    })

    expect(screen.getByTestId('rates')).toHaveTextContent('EUR=0.9')
    expect(source.load).toHaveBeenCalledTimes(1)

    await act(async () => {
      loads[0].resolve(loaded(rates({ PLN: 4 })))
    })

    expect(screen.queryByTestId('fallback')).toBeNull()
    expect(screen.getByTestId('rates')).toHaveTextContent('EUR=0.9,PLN=4')
  })

  it('keeps the identity when a refresh changes nothing', async () => {
    const { source, cacheReads, loads } = createSource()
    const resource = createResource(source)

    const { result } = await renderHookSuspended(() => useResource(resource, 'USD'))
    await act(async () => {
      cacheReads[0].resolve(cached(rates({ EUR: 0.9 }), true))
    })
    const before = result.current
    expect(before).toEqual(rates({ EUR: 0.9 }))

    await act(async () => {
      loads[0].resolve(loaded(rates({ EUR: 0.9 })))
    })

    expect(result.current).toBe(before)
  })

  it('reads the cache and the network once per key for concurrent readers', async () => {
    const { source, cacheReads, loads } = createSource()
    const resource = createResource(source)

    const a = await renderHookSuspended(() => useResource(resource, 'USD'))
    const b = await renderHookSuspended(() => useResource(resource, 'USD'))
    const c = await renderHookSuspended(() => useResource(resource, 'PLN'))

    expect(source.fromCache).toHaveBeenCalledTimes(2)
    expect(source.fromCache).toHaveBeenNthCalledWith(1, 'USD')
    expect(source.fromCache).toHaveBeenNthCalledWith(2, 'PLN')

    await act(async () => {
      cacheReads[0].resolve(cached(rates({ EUR: 0.9 }), true))
      cacheReads[1].resolve(cached(rates({ EUR: 4 }), true))
    })

    expect(source.load).toHaveBeenCalledTimes(2)
    expect(a.result.current).toBe(b.result.current)
    expect(c.result.current).toEqual(rates({ EUR: 4 }))

    await act(async () => {
      loads[0].resolve(loaded(rates({ EUR: 0.9, PLN: 4 })))
    })

    expect(a.result.current).toBe(b.result.current)
    expect(a.result.current).toEqual(rates({ EUR: 0.9, PLN: 4 }))
  })

  it('keeps the value when a refresh fails and retries after the pause', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { source, cacheReads, loads } = createSource()
    const resource = createResource(source)
    const view = await mountSuspended(reader(resource))
    await act(async () => {
      cacheReads[0].resolve(cached(rates({ EUR: 0.9 }), true))
    })
    await act(async () => {
      loads[0].reject(new Error('quota exceeded'))
    })

    expect(screen.getByTestId('rates')).toHaveTextContent('EUR=0.9')
    expect(consoleError).toHaveBeenCalledWith('Refreshing "USD" failed:', expect.any(Error))

    // A render inside the pause does not ask again.
    await act(async () => {
      view.rerender(reader(resource))
    })
    expect(source.load).toHaveBeenCalledTimes(1)

    vi.setSystemTime(Date.now() + RETRY_AFTER_FAILURE_MS)
    await act(async () => {
      view.rerender(reader(resource))
    })
    expect(source.load).toHaveBeenCalledTimes(2)

    await act(async () => {
      loads[1].resolve(loaded(rates({ PLN: 4 })))
    })
    expect(screen.getByTestId('rates')).toHaveTextContent('EUR=0.9,PLN=4')
  })

  it('retries an incomplete answer after the short pause, not the long one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { source, cacheReads, loads } = createSource()
    const resource = createResource(source)
    const view = await mountSuspended(reader(resource))
    await act(async () => {
      cacheReads[0].resolve(unanswered())
    })
    await act(async () => {
      loads[0].resolve(loaded(rates({ EUR: 0.9 }), false))
    })

    expect(screen.getByTestId('rates')).toHaveTextContent('EUR=0.9')

    await act(async () => {
      view.rerender(reader(resource))
    })
    expect(source.load).toHaveBeenCalledTimes(1)

    vi.setSystemTime(Date.now() + RETRY_AFTER_FAILURE_MS)
    await act(async () => {
      view.rerender(reader(resource))
    })
    expect(source.load).toHaveBeenCalledTimes(2)
  })

  it('revalidates once the answer is older than revalidateAfterMs', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { source, cacheReads, loads } = createSource()
    const resource = createResource(source)
    const view = await mountSuspended(reader(resource))
    await act(async () => {
      cacheReads[0].resolve(cached(rates({ EUR: 0.9 })))
    })

    vi.setSystemTime(Date.now() + REVALIDATE_AFTER_MS - 1)
    await act(async () => {
      view.rerender(reader(resource))
    })
    expect(source.load).not.toHaveBeenCalled()

    vi.setSystemTime(Date.now() + 1)
    await act(async () => {
      view.rerender(reader(resource))
    })
    expect(source.load).toHaveBeenCalledTimes(1)

    // One refresh in flight per key, however many renders ask.
    await act(async () => {
      view.rerender(reader(resource))
    })
    expect(source.load).toHaveBeenCalledTimes(1)

    await act(async () => {
      loads[0].resolve(loaded(rates({ EUR: 0.95 })))
    })
    expect(screen.queryByTestId('fallback')).toBeNull()
    expect(screen.getByTestId('rates')).toHaveTextContent('EUR=0.95')
  })

  it('revalidates when the connection comes back online', async () => {
    const { source, cacheReads } = createSource()
    const resource = createResource(source)
    const view = await mountSuspended(reader(resource))
    await act(async () => {
      cacheReads[0].resolve(cached(rates({ EUR: 0.9 })))
    })

    // A notification that is not a transition to online changes nothing.
    resetNetworkStatus()
    reportRequestOutcome('network-failure')
    reportRequestOutcome('network-failure')
    await act(async () => {
      view.rerender(reader(resource))
    })
    expect(source.load).not.toHaveBeenCalled()

    reportRequestOutcome('success')
    await act(async () => {
      view.rerender(reader(resource))
    })
    expect(source.load).toHaveBeenCalledTimes(1)
  })

  // A key that follows live data changes on a Dexie write, a sync render; the
  // old value has to stay up while the new key answers.
  it('keeps the old key on screen while a new key answers', async () => {
    const { source, cacheReads } = createSource()
    const resource = createResource(source)

    await mountSuspended(createElement(Switcher, { resource }))
    await act(async () => {
      cacheReads[0].resolve(cached(rates({ EUR: 0.9 })))
    })
    expect(screen.getByTestId('rates')).toHaveTextContent('EUR=0.9')

    await act(async () => {
      fireEvent.click(screen.getByText('PLN'))
    })

    expect(source.fromCache).toHaveBeenLastCalledWith('PLN')
    expect(screen.queryByTestId('fallback')).toBeNull()
    expect(screen.getByTestId('rates')).toHaveTextContent('EUR=0.9')

    await act(async () => {
      cacheReads[1].resolve(cached(rates({ EUR: 4 })))
    })

    expect(screen.queryByTestId('fallback')).toBeNull()
    expect(screen.getByTestId('rates')).toHaveTextContent('EUR=4')
  })

  it('reports a cache that cannot be read to the boundary and retries after the pause', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { source, cacheReads } = createSource()
    const resource = createResource(source)

    await mountSuspended(
      createElement(Boundary, null, createElement(Rates, { resource, rateKey: 'USD' }))
    )
    await act(async () => {
      cacheReads[0].reject(new Error('index missing'))
    })

    expect(screen.getByTestId('boundary')).toHaveTextContent('index missing')
    expect(consoleError).toHaveBeenCalledWith('Reading "USD" failed:', expect.any(Error))

    // Inside the pause a retry meets the same rejection instead of a new read.
    await act(async () => {
      fireEvent.click(screen.getByText('Retry'))
    })

    expect(screen.getByTestId('boundary')).toHaveTextContent('index missing')
    expect(source.fromCache).toHaveBeenCalledTimes(1)

    vi.setSystemTime(Date.now() + RETRY_AFTER_FAILURE_MS)
    await act(async () => {
      fireEvent.click(screen.getByText('Retry'))
    })
    expect(source.fromCache).toHaveBeenCalledTimes(2)

    await act(async () => {
      cacheReads[1].resolve(cached(rates({ EUR: 0.9 })))
    })

    expect(screen.queryByTestId('boundary')).toBeNull()
    expect(screen.getByTestId('rates')).toHaveTextContent('EUR=0.9')
  })

  it('returns null for a null key without reading', () => {
    const { source } = createSource()
    const resource = createResource(source)

    const { result } = renderHook(() => useResource(resource, null))

    expect(result.current).toBeNull()
    expect(source.fromCache).not.toHaveBeenCalled()
  })

  it('preloads an entry so the first reader never suspends', async () => {
    const { source, cacheReads } = createSource()
    const resource = createResource(source)

    const first = resource.preload('USD')
    expect(resource.preload('USD')).toBe(first)
    cacheReads[0].resolve(cached(rates({ EUR: 0.9 })))
    await first

    render(createElement(Rates, { resource, rateKey: 'USD' }), { wrapper: Suspended })

    expect(screen.queryByTestId('fallback')).toBeNull()
    expect(screen.getByTestId('rates')).toHaveTextContent('EUR=0.9')
    expect(source.fromCache).toHaveBeenCalledTimes(1)
  })

  it('evicts the least recently read idle entries, never a pending or subscribed one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { source, cacheReads } = createSource()
    const resource = createResource(source)

    const pending = resource.entry('pending')
    pending.first()
    await mountSuspended(createElement(Rates, { resource, rateKey: 'subscribed' }))
    await act(async () => {
      cacheReads[1].resolve(cached(rates({ EUR: 1 })))
    })
    const subscribed = resource.entry('subscribed')

    const idle = []
    for (let i = 0; i <= IDLE_ENTRIES_RETAINED; i++) {
      vi.setSystemTime(Date.now() + 1)
      const entry = resource.entry(`idle${i}`)
      idle.push(entry)
      const first = entry.first()
      cacheReads[cacheReads.length - 1].resolve(cached(rates({ EUR: i })))
      await first
    }

    // One more than retained; the newest was still pending when it was created.
    vi.setSystemTime(Date.now() + 1)
    resource.entry('one more')

    expect(resource.entry('pending')).toBe(pending)
    expect(resource.entry('subscribed')).toBe(subscribed)
    expect(resource.entry('idle1')).toBe(idle[1])
    expect(resource.entry(`idle${IDLE_ENTRIES_RETAINED}`)).toBe(idle[IDLE_ENTRIES_RETAINED])
    expect(resource.entry('idle0')).not.toBe(idle[0])
    expect(resource.entry('idle0').getValue()).toBe(NONE)
  })

  it('reads again from scratch after a reset', async () => {
    const { source, cacheReads } = createSource()
    const resource = createResource(source)

    const first = resource.preload('USD')
    cacheReads[0].resolve(cached(rates({ EUR: 0.9 })))
    await first
    expect(resource.entry('USD').getValue()).toEqual(rates({ EUR: 0.9 }))

    resetResources()

    expect(resource.entry('USD').getValue()).toBe(NONE)
    resource.preload('USD')
    expect(source.fromCache).toHaveBeenCalledTimes(2)
  })
})
