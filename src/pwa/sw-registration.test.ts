import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { registerSW, type RegisterSWOptions } from 'virtual:pwa-register'
import { initServiceWorker, SW_UPDATE_CHECK_MIN_INTERVAL_MS } from './sw-registration'

vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn() }))

const mockedRegisterSW = vi.mocked(registerSW)

const originalServiceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')

let capturedOptions: RegisterSWOptions | undefined
let updateSw: ReturnType<typeof vi.fn>
let registration: { update: ReturnType<typeof vi.fn> }
let teardown: (() => void) | undefined

function defineServiceWorker(value: unknown) {
  Object.defineProperty(navigator, 'serviceWorker', { value, configurable: true, writable: true })
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
}

function registered() {
  capturedOptions?.onRegisteredSW?.('/sw.js', registration as unknown as ServiceWorkerRegistration)
}

beforeEach(() => {
  capturedOptions = undefined
  updateSw = vi.fn(async () => {})
  registration = { update: vi.fn(async () => {}) }
  mockedRegisterSW.mockImplementation((options?: RegisterSWOptions) => {
    capturedOptions = options
    return updateSw as unknown as (reloadPage?: boolean) => Promise<void>
  })
  defineServiceWorker({})
  setVisibility('visible')
})

afterEach(() => {
  teardown?.()
  teardown = undefined
  vi.useRealTimers()
  vi.clearAllMocks()
  if (originalServiceWorkerDescriptor) {
    Object.defineProperty(navigator, 'serviceWorker', originalServiceWorkerDescriptor)
  } else {
    Reflect.deleteProperty(navigator, 'serviceWorker')
  }
  if (originalVisibilityDescriptor) {
    Object.defineProperty(Document.prototype, 'visibilityState', originalVisibilityDescriptor)
  }
  Reflect.deleteProperty(document, 'visibilityState')
})

describe('initServiceWorker', () => {
  it('does nothing and returns a no-op teardown when service workers are unsupported', () => {
    Reflect.deleteProperty(navigator, 'serviceWorker')

    const stop = initServiceWorker({ onNeedRefresh: vi.fn() })

    expect(mockedRegisterSW).not.toHaveBeenCalled()
    expect(() => stop()).not.toThrow()
  })

  it('calls registerSW once with immediate true', () => {
    teardown = initServiceWorker({ onNeedRefresh: vi.fn() })

    expect(mockedRegisterSW).toHaveBeenCalledTimes(1)
    expect(mockedRegisterSW).toHaveBeenCalledWith(expect.objectContaining({ immediate: true }))
  })

  it('forwards onNeedRefresh to the handler', () => {
    const onNeedRefresh = vi.fn()
    teardown = initServiceWorker({ onNeedRefresh })

    capturedOptions?.onNeedRefresh?.()

    expect(onNeedRefresh).toHaveBeenCalledTimes(1)
    expect(typeof onNeedRefresh.mock.calls[0][0]).toBe('function')
  })

  it('the applyUpdate passed to the handler calls the updater with true', async () => {
    const onNeedRefresh = vi.fn()
    teardown = initServiceWorker({ onNeedRefresh })

    capturedOptions?.onNeedRefresh?.()
    await onNeedRefresh.mock.calls[0][0]()

    expect(updateSw).toHaveBeenCalledWith(true)
  })

  it('checks for an update on the online event once a registration exists', () => {
    teardown = initServiceWorker({ onNeedRefresh: vi.fn() })
    registered()

    window.dispatchEvent(new Event('online'))

    expect(registration.update).toHaveBeenCalledTimes(1)
  })

  it('does not check again within the hour', () => {
    teardown = initServiceWorker({ onNeedRefresh: vi.fn() })
    registered()

    window.dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))

    expect(registration.update).toHaveBeenCalledTimes(1)
  })

  it('checks again after the hour elapses', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    teardown = initServiceWorker({ onNeedRefresh: vi.fn() })
    registered()

    document.dispatchEvent(new Event('visibilitychange'))
    expect(registration.update).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(SW_UPDATE_CHECK_MIN_INTERVAL_MS)
    document.dispatchEvent(new Event('visibilitychange'))

    expect(registration.update).toHaveBeenCalledTimes(2)
  })

  it('checks on visibilitychange when visible', () => {
    teardown = initServiceWorker({ onNeedRefresh: vi.fn() })
    registered()

    document.dispatchEvent(new Event('visibilitychange'))

    expect(registration.update).toHaveBeenCalledTimes(1)
  })

  it('does not check on visibilitychange when hidden', () => {
    teardown = initServiceWorker({ onNeedRefresh: vi.fn() })
    registered()
    setVisibility('hidden')

    document.dispatchEvent(new Event('visibilitychange'))

    expect(registration.update).not.toHaveBeenCalled()
  })

  it('does not throw when a check fires before onRegisteredSW', () => {
    teardown = initServiceWorker({ onNeedRefresh: vi.fn() })

    expect(() => window.dispatchEvent(new Event('online'))).not.toThrow()
    expect(registration.update).not.toHaveBeenCalled()
  })

  it('the teardown removes both listeners', () => {
    const stop = initServiceWorker({ onNeedRefresh: vi.fn() })
    registered()

    stop()
    window.dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))

    expect(registration.update).not.toHaveBeenCalled()
  })
})
