import { useEffect } from 'react'
import { toast } from 'sonner'
import { initServiceWorker } from '@/pwa/sw-registration'

// StrictMode mounts effects twice; without this a second concurrent mount would
// register a second service worker seam.
let initialized = false

export function ServiceWorkerUpdatePrompt(): null {
  useEffect(() => {
    if (initialized) return
    initialized = true

    const teardown = initServiceWorker({
      onNeedRefresh: (applyUpdate) => {
        toast('A new version is available', {
          description: 'Reload to get the latest version.',
          duration: Infinity,
          id: 'sw-update',
          // The Toaster is anchored bottom-right, which on a phone is exactly
          // where AppSidebarMobile's fixed nav bar sits. A duration-Infinity
          // toast there covers the app's only navigation, so this one opts out
          // of that corner and carries its own close button rather than
          // relying on the user discovering swipe-to-dismiss.
          position: 'top-center',
          closeButton: true,
          action: {
            label: 'Reload',
            onClick: () => {
              void applyUpdate()
            },
          },
        })
      },
    })

    return () => {
      initialized = false
      teardown()
    }
  }, [])

  return null
}
