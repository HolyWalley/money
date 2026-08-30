import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { toast } from 'sonner'
import { initServiceWorker } from '@/pwa/sw-registration'
import { ServiceWorkerUpdatePrompt } from './ServiceWorkerUpdatePrompt'

vi.mock('sonner', () => ({ toast: vi.fn() }))
vi.mock('@/pwa/sw-registration', () => ({ initServiceWorker: vi.fn() }))

const mockedInit = vi.mocked(initServiceWorker)
const mockedToast = vi.mocked(toast)

let swTeardown: ReturnType<typeof vi.fn>
let capturedOnNeedRefresh: ((applyUpdate: () => Promise<void>) => void) | undefined

beforeEach(() => {
  swTeardown = vi.fn()
  capturedOnNeedRefresh = undefined
  mockedInit.mockImplementation((handlers) => {
    capturedOnNeedRefresh = handlers.onNeedRefresh
    return swTeardown
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ServiceWorkerUpdatePrompt', () => {
  it('renders null', () => {
    const { container } = render(<ServiceWorkerUpdatePrompt />)

    expect(container).toBeEmptyDOMElement()
  })

  it('calls initServiceWorker once on mount', () => {
    render(<ServiceWorkerUpdatePrompt />)

    expect(mockedInit).toHaveBeenCalledTimes(1)
  })

  it('raises a persistent toast with a Reload action on onNeedRefresh', () => {
    render(<ServiceWorkerUpdatePrompt />)

    capturedOnNeedRefresh?.(async () => {})

    expect(mockedToast).toHaveBeenCalledTimes(1)
    const [message, options] = mockedToast.mock.calls[0]
    expect(message).toBe('A new version is available')
    expect(options).toMatchObject({ duration: Infinity, id: 'sw-update' })
    expect(options?.action).toMatchObject({ label: 'Reload' })
  })

  it('keeps the toast out of the bottom-right corner the mobile nav occupies', () => {
    render(<ServiceWorkerUpdatePrompt />)

    capturedOnNeedRefresh?.(async () => {})

    const options = mockedToast.mock.calls[0][1]
    expect(options?.position).toBeDefined()
    expect(options?.position).not.toMatch(/^bottom-/)
  })

  it('gives the persistent toast an explicit way to dismiss it', () => {
    render(<ServiceWorkerUpdatePrompt />)

    capturedOnNeedRefresh?.(async () => {})

    const options = mockedToast.mock.calls[0][1]
    expect(options?.closeButton).toBe(true)
    expect(options?.dismissible).not.toBe(false)
  })

  it('the Reload action applies the update', () => {
    render(<ServiceWorkerUpdatePrompt />)

    const applyUpdate = vi.fn(async () => {})
    capturedOnNeedRefresh?.(applyUpdate)

    const action = mockedToast.mock.calls[0][1]?.action as { onClick: (event: unknown) => void }
    action.onClick(new MouseEvent('click'))

    expect(applyUpdate).toHaveBeenCalledTimes(1)
  })

  it('calls the teardown on unmount', () => {
    const { unmount } = render(<ServiceWorkerUpdatePrompt />)

    unmount()

    expect(swTeardown).toHaveBeenCalledTimes(1)
  })
})
