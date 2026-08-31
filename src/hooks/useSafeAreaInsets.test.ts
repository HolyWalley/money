import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

/**
 * The module caches its measurement in module scope, so every test re-imports it
 * to start from a clean probe and a clean cache.
 */
async function load() {
  vi.resetModules()
  return import('./useSafeAreaInsets')
}

function stubInsets(insets: Partial<Record<'top' | 'right' | 'bottom' | 'left', string>>) {
  const real = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element: Element) => {
    const isProbe = element.hasAttribute('data-safe-area-probe')
    if (!isProbe) return real(element)
    return {
      paddingTop: insets.top ?? '0px',
      paddingRight: insets.right ?? '0px',
      paddingBottom: insets.bottom ?? '0px',
      paddingLeft: insets.left ?? '0px',
    } as CSSStyleDeclaration
  })
}

describe('useSafeAreaInsets', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads the insets from the probe element', async () => {
    stubInsets({ top: '59px', bottom: '34px' })
    const { useSafeAreaInsets } = await load()

    const { result } = renderHook(() => useSafeAreaInsets())

    expect(result.current).toEqual({ top: 59, right: 0, bottom: 34, left: 0 })
  })

  it('reports zero when the platform has no insets', async () => {
    stubInsets({})
    const { useSafeAreaInsets } = await load()

    const { result } = renderHook(() => useSafeAreaInsets())

    expect(result.current).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })

  it('measures env() through a real element rather than a custom property', async () => {
    stubInsets({ top: '59px' })
    const { useSafeAreaInsets } = await load()

    renderHook(() => useSafeAreaInsets())

    const probe = document.querySelector('[data-safe-area-probe]')
    expect(probe).not.toBeNull()
    // Hidden and unreachable: it exists only to be measured.
    expect(probe?.getAttribute('aria-hidden')).toBe('true')
  })

  it('re-measures when the viewport changes', async () => {
    stubInsets({ top: '59px' })
    const { useSafeAreaInsets } = await load()

    const { result } = renderHook(() => useSafeAreaInsets())
    expect(result.current.top).toBe(59)

    // Landscape on the same phone moves the inset to the sides.
    stubInsets({ top: '0px', left: '59px', right: '59px' })
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(result.current).toEqual({ top: 0, right: 59, bottom: 0, left: 59 })
  })

  it('keeps a stable snapshot when nothing moved', async () => {
    stubInsets({ top: '59px' })
    const { useSafeAreaInsets } = await load()

    const { result } = renderHook(() => useSafeAreaInsets())
    const first = result.current

    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    // A fresh object on every resize would re-render useSyncExternalStore forever.
    expect(result.current).toBe(first)
  })
})

describe('useSafeAreaCollisionPadding', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('adds the insets on top of Base UI’s own default padding', async () => {
    stubInsets({ top: '59px', bottom: '34px' })
    const { useSafeAreaCollisionPadding } = await load()

    const { result } = renderHook(() => useSafeAreaCollisionPadding())

    expect(result.current).toEqual({ top: 64, right: 5, bottom: 39, left: 5 })
  })

  it('falls back to the plain default with no insets', async () => {
    stubInsets({})
    const { useSafeAreaCollisionPadding } = await load()

    const { result } = renderHook(() => useSafeAreaCollisionPadding())

    // Unchanged behaviour on a device with no notch.
    expect(result.current).toEqual({ top: 5, right: 5, bottom: 5, left: 5 })
  })
})
