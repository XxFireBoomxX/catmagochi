import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NotificationSettings } from './useNotificationSettings'

const enabledSettings: NotificationSettings = { global: true, message: true, attention: true, update: true }
const disabledSettings: NotificationSettings = { global: false, message: true, attention: true, update: true }

async function loadUsePushSubscription(url: string, token: string, vapidKey: string) {
  vi.resetModules()
  // The repo's real .env (used for local relay testing) may set these for
  // real -- always stub explicitly, matching useMessages.test.ts's pattern.
  vi.stubEnv('VITE_RELAY_URL', url)
  vi.stubEnv('VITE_RELAY_TOKEN', token)
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', vapidKey)
  const mod = await import('./usePushSubscription')
  return mod.usePushSubscription
}

function setupBrowserMocks({
  subscribeImpl,
  getSubscriptionImpl,
  requestPermissionImpl,
}: {
  subscribeImpl?: ReturnType<typeof vi.fn>
  getSubscriptionImpl?: ReturnType<typeof vi.fn>
  requestPermissionImpl?: ReturnType<typeof vi.fn>
} = {}) {
  const subscription = {
    endpoint: 'https://push.example.test/abc',
    toJSON: () => ({ endpoint: 'https://push.example.test/abc', keys: { p256dh: 'x', auth: 'y' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  }
  const getSubscription = getSubscriptionImpl ?? vi.fn().mockResolvedValue(null)
  const subscribe = subscribeImpl ?? vi.fn().mockResolvedValue(subscription)
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { ready: Promise.resolve({ pushManager: { getSubscription, subscribe } }) },
    configurable: true,
    writable: true,
  })
  vi.stubGlobal('PushManager', class {})
  const requestPermission = requestPermissionImpl ?? vi.fn().mockResolvedValue('granted')
  vi.stubGlobal('Notification', { requestPermission })
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, pushEnabled: true }) })
  vi.stubGlobal('fetch', fetchMock)
  return { subscription, getSubscription, subscribe, requestPermission, fetchMock }
}

describe('usePushSubscription', () => {
  afterEach(() => {
    // @ts-expect-error test cleanup of a jsdom-absent API
    delete navigator.serviceWorker
  })

  it('stays idle when relay/vapid env vars are unconfigured', async () => {
    const usePushSubscription = await loadUsePushSubscription('', '', '')
    setupBrowserMocks()
    const { result } = renderHook(() => usePushSubscription(enabledSettings))
    await act(async () => {})
    expect(result.current.status).toBe('idle')
  })

  it('reports unsupported when push APIs are missing from the browser', async () => {
    const usePushSubscription = await loadUsePushSubscription('wss://relay.test', 'tok', 'BAvapidkey')
    // deliberately not calling setupBrowserMocks(): no serviceWorker/PushManager/Notification
    const { result } = renderHook(() => usePushSubscription(enabledSettings))
    await act(async () => {})
    expect(result.current.status).toBe('unsupported')
  })

  it('subscribes and posts to /push/subscribe when global is on and permission is granted', async () => {
    const usePushSubscription = await loadUsePushSubscription('wss://relay.test', 'tok', 'BAvapidkey')
    const { fetchMock, subscribe } = setupBrowserMocks()
    const { result } = renderHook(() => usePushSubscription(enabledSettings))
    await act(async () => {})
    expect(result.current.status).toBe('subscribed')
    expect(subscribe).toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith('https://relay.test/push/subscribe', expect.objectContaining({ method: 'POST' }))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toEqual({
      token: 'tok',
      subscription: { endpoint: 'https://push.example.test/abc', keys: { p256dh: 'x', auth: 'y' } },
      types: { message: true, update: true },
    })
  })

  it('reuses an existing subscription instead of creating a new one', async () => {
    const usePushSubscription = await loadUsePushSubscription('wss://relay.test', 'tok', 'BAvapidkey')
    const existing = {
      endpoint: 'https://push.example.test/existing',
      toJSON: () => ({ endpoint: 'https://push.example.test/existing', keys: { p256dh: 'x', auth: 'y' } }),
      unsubscribe: vi.fn(),
    }
    const { subscribe } = setupBrowserMocks({ getSubscriptionImpl: vi.fn().mockResolvedValue(existing) })
    const { result } = renderHook(() => usePushSubscription(enabledSettings))
    await act(async () => {})
    expect(result.current.status).toBe('subscribed')
    expect(subscribe).not.toHaveBeenCalled()
  })

  it('reports denied when permission is not granted', async () => {
    const usePushSubscription = await loadUsePushSubscription('wss://relay.test', 'tok', 'BAvapidkey')
    setupBrowserMocks({ requestPermissionImpl: vi.fn().mockResolvedValue('denied') })
    const { result } = renderHook(() => usePushSubscription(enabledSettings))
    await act(async () => {})
    expect(result.current.status).toBe('denied')
  })

  it('unsubscribes and posts to /push/unsubscribe when global is off and a subscription exists', async () => {
    const usePushSubscription = await loadUsePushSubscription('wss://relay.test', 'tok', 'BAvapidkey')
    const existing = {
      endpoint: 'https://push.example.test/existing',
      toJSON: () => ({}),
      unsubscribe: vi.fn().mockResolvedValue(true),
    }
    const { fetchMock } = setupBrowserMocks({ getSubscriptionImpl: vi.fn().mockResolvedValue(existing) })
    const { result } = renderHook(() => usePushSubscription(disabledSettings))
    await act(async () => {})
    expect(result.current.status).toBe('unsubscribed')
    expect(existing.unsubscribe).toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://relay.test/push/unsubscribe',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('does nothing when global is off and there was never a subscription', async () => {
    const usePushSubscription = await loadUsePushSubscription('wss://relay.test', 'tok', 'BAvapidkey')
    const { fetchMock } = setupBrowserMocks() // getSubscription resolves null by default
    const { result } = renderHook(() => usePushSubscription(disabledSettings))
    await act(async () => {})
    expect(result.current.status).toBe('unsubscribed')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports error when subscribing throws', async () => {
    const usePushSubscription = await loadUsePushSubscription('wss://relay.test', 'tok', 'BAvapidkey')
    setupBrowserMocks({ subscribeImpl: vi.fn().mockRejectedValue(new Error('nope')) })
    const { result } = renderHook(() => usePushSubscription(enabledSettings))
    await act(async () => {})
    expect(result.current.status).toBe('error')
  })

  it('ignores an overlapping sync while one is already in flight', async () => {
    const usePushSubscription = await loadUsePushSubscription('wss://relay.test', 'tok', 'BAvapidkey')
    let resolveGetSubscription: (value: null) => void = () => {}
    const deferred = new Promise<null>((resolve) => {
      resolveGetSubscription = resolve
    })
    const { fetchMock } = setupBrowserMocks({ getSubscriptionImpl: vi.fn().mockReturnValue(deferred) })

    const { rerender } = renderHook((settings: NotificationSettings) => usePushSubscription(settings), {
      initialProps: enabledSettings,
    })
    // the first sync is now paused awaiting getSubscription()

    rerender({ ...enabledSettings, message: false }) // a real dependency change, but syncing.current should block it

    resolveGetSubscription(null)
    await act(async () => {})

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
