import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePwaUpdate } from './usePwaUpdate'

function stubServiceWorker(value: unknown) {
  Object.defineProperty(navigator, 'serviceWorker', {
    value,
    configurable: true,
    writable: true,
  })
}

describe('usePwaUpdate', () => {
  afterEach(() => {
    // @ts-expect-error test cleanup of a jsdom-absent API
    delete navigator.serviceWorker
  })

  it('starts idle', () => {
    const { result } = renderHook(() => usePwaUpdate())
    expect(result.current.status).toBe('idle')
  })

  it('is unsupported when the Service Worker API does not exist', async () => {
    // @ts-expect-error ensure it is absent for this test
    delete navigator.serviceWorker
    const { result } = renderHook(() => usePwaUpdate())
    await act(async () => {
      await result.current.checkForUpdate()
    })
    expect(result.current.status).toBe('unsupported')
  })

  it('is unsupported when there is no active registration', async () => {
    stubServiceWorker({ getRegistration: vi.fn().mockResolvedValue(undefined) })
    const { result } = renderHook(() => usePwaUpdate())
    await act(async () => {
      await result.current.checkForUpdate()
    })
    expect(result.current.status).toBe('unsupported')
  })

  it('is up-to-date when update() finds nothing installing or waiting', async () => {
    const registration = { update: vi.fn().mockResolvedValue(undefined), installing: null, waiting: null }
    stubServiceWorker({ getRegistration: vi.fn().mockResolvedValue(registration) })
    const { result } = renderHook(() => usePwaUpdate())
    await act(async () => {
      await result.current.checkForUpdate()
    })
    expect(result.current.status).toBe('up-to-date')
    expect(registration.update).toHaveBeenCalled()
  })

  it('is updating when a new worker is installing', async () => {
    const registration = { update: vi.fn().mockResolvedValue(undefined), installing: {}, waiting: null }
    stubServiceWorker({ getRegistration: vi.fn().mockResolvedValue(registration) })
    const { result } = renderHook(() => usePwaUpdate())
    await act(async () => {
      await result.current.checkForUpdate()
    })
    expect(result.current.status).toBe('updating')
  })

  it('is updating when a worker is waiting to activate', async () => {
    const registration = { update: vi.fn().mockResolvedValue(undefined), installing: null, waiting: {} }
    stubServiceWorker({ getRegistration: vi.fn().mockResolvedValue(registration) })
    const { result } = renderHook(() => usePwaUpdate())
    await act(async () => {
      await result.current.checkForUpdate()
    })
    expect(result.current.status).toBe('updating')
  })

  it('is error when the registration lookup throws', async () => {
    stubServiceWorker({ getRegistration: vi.fn().mockRejectedValue(new Error('nope')) })
    const { result } = renderHook(() => usePwaUpdate())
    await act(async () => {
      await result.current.checkForUpdate()
    })
    expect(result.current.status).toBe('error')
  })
})
