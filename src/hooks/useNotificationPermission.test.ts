import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotificationPermission } from './useNotificationPermission'

function stubNotification(permission: NotificationPermission, request = vi.fn()) {
  vi.stubGlobal('Notification', { permission, requestPermission: request })
  return request
}

describe('useNotificationPermission', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports unsupported when the browser has no Notification API', () => {
    vi.stubGlobal('Notification', undefined)
    const { result } = renderHook(() => useNotificationPermission(true))
    expect(result.current).toBe('unsupported')
  })

  it('asks nothing while notifications are switched off', async () => {
    const request = stubNotification('default')
    renderHook(() => useNotificationPermission(false))
    await act(async () => {})
    expect(request).not.toHaveBeenCalled()
  })

  // The whole point of this hook: the prompt must not depend on the relay
  // being configured. The local "cat needs attention" alert needs permission
  // and nothing else, and it used to be blocked behind a push subscription
  // that no-ops without a relay.
  it('asks as soon as notifications are switched on, with no relay involved', async () => {
    const request = stubNotification('default', vi.fn().mockResolvedValue('granted'))
    const { result } = renderHook(() => useNotificationPermission(true))
    await act(async () => {})
    expect(request).toHaveBeenCalledTimes(1)
    expect(result.current).toBe('granted')
  })

  it('reports a refusal', async () => {
    stubNotification('default', vi.fn().mockResolvedValue('denied'))
    const { result } = renderHook(() => useNotificationPermission(true))
    await act(async () => {})
    expect(result.current).toBe('denied')
  })

  it('does not ask again when permission was already granted', async () => {
    const request = stubNotification('granted')
    const { result } = renderHook(() => useNotificationPermission(true))
    await act(async () => {})
    expect(request).not.toHaveBeenCalled()
    expect(result.current).toBe('granted')
  })

  // Browsers only prompt once; asking again after a refusal is silently
  // rejected and would just burn a call on every render.
  it('does not ask again after a refusal', async () => {
    const request = stubNotification('denied')
    const { result } = renderHook(() => useNotificationPermission(true))
    await act(async () => {})
    expect(request).not.toHaveBeenCalled()
    expect(result.current).toBe('denied')
  })

  it('asks only once even if the setting is re-applied', async () => {
    const request = stubNotification('default', vi.fn().mockResolvedValue('granted'))
    const { rerender } = renderHook(({ on }) => useNotificationPermission(on), {
      initialProps: { on: true },
    })
    await act(async () => {})
    rerender({ on: true })
    await act(async () => {})
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('survives a browser that rejects the request outright', async () => {
    stubNotification('default', vi.fn().mockRejectedValue(new Error('nope')))
    const { result } = renderHook(() => useNotificationPermission(true))
    await act(async () => {})
    expect(result.current).toBe('default')
  })
})
