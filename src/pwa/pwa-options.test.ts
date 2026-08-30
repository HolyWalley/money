import { describe, it, expect } from 'vitest'
import { pwaOptions, PWA_OUT_DIR } from './pwa-options'

type RuntimeCachingEntry = NonNullable<NonNullable<typeof pwaOptions.workbox>['runtimeCaching']>[number]

const workbox = pwaOptions.workbox!

function fallbackIsDeniedFor(pathname: string): boolean {
  const denylist = (workbox.navigateFallbackDenylist ?? []) as RegExp[]
  return denylist.some(pattern => pattern.test(pathname))
}

function entryMatches(entry: RuntimeCachingEntry, url: URL): boolean {
  const pattern = entry.urlPattern
  if (typeof pattern === 'string') return pattern === url.pathname || pattern === url.href
  if (pattern instanceof RegExp) return pattern.test(url.href)
  return Boolean((pattern as (options: { url: URL }) => unknown)({ url }))
}

function entriesMatching(url: URL): RuntimeCachingEntry[] {
  return (workbox.runtimeCaching ?? []).filter(entry => entryMatches(entry, url))
}

// Minimal support for the only glob shapes this config uses: a leading `**/`,
// `*` within a path segment, and a `{a,b,c}` alternation.
function globToRegExp(pattern: string): RegExp {
  const doubleStar = '\u0000'
  const source = pattern
    .replace(/\*\*\//g, doubleStar)
    .replace(/[.+^$()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\{([^}]+)\}/g, (_all, group: string) => `(?:${group.split(',').join('|')})`)
    .replaceAll(doubleStar, '(?:[^/]+/)*')
  return new RegExp(`^${source}$`)
}

function precacheCovers(buildOutputPath: string): boolean {
  return (workbox.globPatterns ?? []).some(pattern => globToRegExp(pattern).test(buildOutputPath))
}

describe('pwaOptions', () => {
  it('emits into dist/client', () => {
    expect(PWA_OUT_DIR).toBe('dist/client')
    expect(pwaOptions.outDir).toBe('dist/client')
  })

  it('uses the prompt update strategy', () => {
    expect(pwaOptions.registerType).toBe('prompt')
  })

  it('owns its own registration', () => {
    expect(pwaOptions.injectRegister).toBeNull()
  })

  it('raises the precache size cap above the current bundle', () => {
    expect(workbox.maximumFileSizeToCacheInBytes).toBeGreaterThanOrEqual(4 * 1024 * 1024)
  })

  it('precaches fonts, icons, the shell and the manifest', () => {
    expect(precacheCovers('assets/geist-latin-wght-normal-BgDaEnEv.woff2')).toBe(true)
    expect(precacheCovers('icon-512.png')).toBe(true)
    expect(precacheCovers('favicon.svg')).toBe(true)
    expect(precacheCovers('index.html')).toBe(true)
    expect(precacheCovers('assets/index-DYXynYyN.js')).toBe(true)
    expect(precacheCovers('assets/index-BSkVejRo.css')).toBe(true)
    expect(precacheCovers('manifest.webmanifest')).toBe(true)
    expect(precacheCovers('robots.txt')).toBe(false)
  })

  it('denies the navigation fallback for /api/v1/me', () => {
    expect(fallbackIsDeniedFor('/api/v1/me')).toBe(true)
  })

  it('denies the navigation fallback for /api/v1/dump', () => {
    expect(fallbackIsDeniedFor('/api/v1/dump')).toBe(true)
  })

  it('denies the navigation fallback for /admin', () => {
    expect(fallbackIsDeniedFor('/admin')).toBe(true)
  })

  it('allows the navigation fallback for /dashboard', () => {
    expect(workbox.navigateFallback).toBe('index.html')
    expect(fallbackIsDeniedFor('/dashboard')).toBe(false)
  })

  it('handles every /api path as NetworkOnly', () => {
    const matched = entriesMatching(new URL('https://x/api/v1/me'))
    expect(matched.length).toBeGreaterThan(0)
    for (const entry of matched) {
      expect(entry.handler).toBe('NetworkOnly')
    }
  })

  it('defines no caching strategy for any /api path', () => {
    const paths = ['/api/v1/me', '/api/v1/sync', '/api/v1/dump', '/api/v1/refresh']
    for (const path of paths) {
      for (const entry of entriesMatching(new URL(`https://x${path}`))) {
        expect(entry.handler).toBe('NetworkOnly')
        expect(entry.options?.cacheName).toBeUndefined()
      }
    }
  })

  it('precaches sw-reset.html so the kill switch survives offline', () => {
    expect(precacheCovers('sw-reset.html')).toBe(true)
  })

  it('lists nothing that globPatterns already matches', () => {
    // Anything added through includeAssets or includeManifestIcons lands in the
    // manifest a second time, because globPatterns matches it in the output too.
    for (const asset of ['favicon.svg', 'apple-touch-icon.png', 'sw-reset.html']) {
      expect(precacheCovers(asset)).toBe(true)
    }
    expect(pwaOptions.includeAssets ?? []).toEqual([])
    expect(pwaOptions.includeManifestIcons).toBe(false)
  })

  it('still precaches every manifest icon without includeManifestIcons', () => {
    const manifest = pwaOptions.manifest
    expect(manifest).toBeTruthy()
    const icons = (manifest === false ? undefined : manifest?.icons) ?? []
    expect(icons.length).toBeGreaterThan(0)
    for (const icon of icons) {
      expect(precacheCovers(icon.src.replace(/^\//, ''))).toBe(true)
    }
  })

  it('keeps dev options disabled', () => {
    expect(pwaOptions.devOptions?.enabled).toBe(false)
  })
})
