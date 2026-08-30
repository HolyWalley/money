import type { VitePWAOptions } from 'vite-plugin-pwa'

export const PWA_OUT_DIR = 'dist/client'

export const pwaOptions: Partial<VitePWAOptions> = {
  // vite-plugin-pwa reads outDir from the SHARED resolved config, which
  // @cloudflare/vite-plugin leaves at 'dist' while the deployed client output
  // is dist/client.
  outDir: PWA_OUT_DIR,
  registerType: 'prompt',
  injectRegister: null,
  // No includeAssets and no includeManifestIcons: both add entries to the
  // precache manifest on top of workbox.globPatterns below, which already
  // matches every one of those files in the build output, so each would be
  // listed twice. manifest.webmanifest is still listed twice regardless —
  // vite-plugin-pwa appends its own entry for it whenever `manifest` is set —
  // but both entries carry the same revision, so workbox accepts them.
  includeManifestIcons: false,
  manifest: {
    name: 'Money',
    short_name: 'Money',
    description: 'Track your expenses and manage your finances',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,woff2,svg,png,ico,webmanifest}'],
    // The main bundle is already 1,772,304 bytes against workbox's 2 MiB default.
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    navigateFallback: 'index.html',
    // The database dump download is an <a download> click, i.e. a navigation;
    // without this the service worker would answer it with the app shell.
    navigateFallbackDenylist: [/^\/api\//, /^\/admin(\/|$)/],
    // Auth is cookie-based, so a cached /api response is a correctness and
    // security defect. Behaviourally a no-op today; it exists so a future broad
    // caching rule cannot shadow /api.
    runtimeCaching: [
      {
        urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/api/'),
        handler: 'NetworkOnly',
      },
    ],
    cleanupOutdatedCaches: true,
  },
  // devOptions writes dev-dist/, which is ignored by neither .gitignore nor
  // eslint, and would install a service worker on the Playwright baseURL where
  // it can shadow page.route interception.
  devOptions: { enabled: false },
}
