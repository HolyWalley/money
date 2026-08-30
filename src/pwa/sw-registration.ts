import { registerSW } from 'virtual:pwa-register'

export interface SwRegistrationHandlers {
  onNeedRefresh: (applyUpdate: () => Promise<void>) => void
  onOfflineReady?: () => void
}

export const SW_UPDATE_CHECK_MIN_INTERVAL_MS = 3_600_000

export function initServiceWorker(handlers: SwRegistrationHandlers): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {}
  }

  const state: {
    registration?: ServiceWorkerRegistration
    update?: (reloadPage?: boolean) => Promise<void>
    lastCheck: number
  } = { lastCheck: 0 }

  state.update = registerSW({
    immediate: true,
    onNeedRefresh: () => handlers.onNeedRefresh(async () => {
      await state.update?.(true)
    }),
    onOfflineReady: handlers.onOfflineReady,
    onRegisteredSW: (_url, registration) => {
      state.registration = registration
    },
  })

  // registerType 'prompt' lets an open tab run an old shell indefinitely; this
  // bounds the skew without polling.
  const check = () => {
    const now = Date.now()
    if (now - state.lastCheck < SW_UPDATE_CHECK_MIN_INTERVAL_MS) return
    state.lastCheck = now
    void state.registration?.update().catch(() => {})
  }

  const onOnline = () => {
    state.lastCheck = 0
    check()
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') check()
  }

  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
