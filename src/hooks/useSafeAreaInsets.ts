import { useMemo, useSyncExternalStore } from 'react'

export interface SafeAreaInsets {
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * Base UI's own default, kept so a device with no insets positions exactly as before.
 */
const BASE_COLLISION_PADDING = 5

const ZERO: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 }

let cached: SafeAreaInsets = ZERO
let probe: HTMLDivElement | null = null
const listeners = new Set<() => void>()

/**
 * env() is read through a real element's computed padding rather than a custom
 * property on :root. Custom properties hand back an unresolved token stream in
 * some engines, so the value would arrive as the literal string "env(...)"; a
 * padding shorthand is always resolved to pixels by the time it is computed.
 */
function measure(): SafeAreaInsets {
  if (typeof document === 'undefined') return ZERO

  if (!probe) {
    probe = document.createElement('div')
    probe.setAttribute('aria-hidden', 'true')
    // Identifies the probe without depending on how an engine reserialises the
    // env() padding below - jsdom, for one, drops the declaration entirely.
    probe.setAttribute('data-safe-area-probe', '')
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) ' +
      'env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'
    document.body.appendChild(probe)
  }

  const style = getComputedStyle(probe)
  return {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  }
}

function refresh(): void {
  const next = measure()
  const unchanged =
    next.top === cached.top &&
    next.right === cached.right &&
    next.bottom === cached.bottom &&
    next.left === cached.left
  // getSnapshot has to be referentially stable or useSyncExternalStore re-renders
  // forever, so the cache is only replaced when a number actually moved.
  if (unchanged) return

  cached = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    refresh()
    window.addEventListener('resize', refresh)
    window.addEventListener('orientationchange', refresh)
  }
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.removeEventListener('resize', refresh)
      window.removeEventListener('orientationchange', refresh)
    }
  }
}

function getSnapshot(): SafeAreaInsets {
  return cached
}

function getServerSnapshot(): SafeAreaInsets {
  return ZERO
}

export function useSafeAreaInsets(): SafeAreaInsets {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * Anchored popups portal to the body, so the layout's .pt-safe padding never
 * reaches them and a tall one expands to the physical top of the screen - which
 * on a notched iPhone is behind the status bar. Collision padding is the only
 * lever that moves both the placement and the --available-height the popup sizes
 * itself from.
 */
export function useSafeAreaCollisionPadding(): SafeAreaInsets {
  const insets = useSafeAreaInsets()

  return useMemo(
    () => ({
      top: BASE_COLLISION_PADDING + insets.top,
      right: BASE_COLLISION_PADDING + insets.right,
      bottom: BASE_COLLISION_PADDING + insets.bottom,
      left: BASE_COLLISION_PADDING + insets.left,
    }),
    [insets]
  )
}
