import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAttentionNotifications } from './useAttentionNotifications'
import type { PetStats } from '../types'
import type { NotificationSettings } from './useNotificationSettings'

const healthyStats: PetStats = { fullness: 80, happiness: 80, energy: 80, cleanliness: 80 }
const enabledSettings: NotificationSettings = { global: true, message: true, attention: true, update: true }

function stubNotificationSupport(permission: NotificationPermission | 'unsupported') {
  if (permission === 'unsupported') {
    // @ts-expect-error simulate an environment without the Notification API
    delete window.Notification
  } else {
    vi.stubGlobal('Notification', { permission })
  }
}

function stubServiceWorker(showNotification: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { ready: Promise.resolve({ showNotification }) },
    configurable: true,
    writable: true,
  })
}

describe('useAttentionNotifications', () => {
  let showNotification: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    showNotification = vi.fn()
    stubNotificationSupport('granted')
    stubServiceWorker(showNotification)
  })

  afterEach(() => {
    vi.useRealTimers()
    // @ts-expect-error test cleanup
    delete navigator.serviceWorker
  })

  it('does nothing when stats/name are not yet available', async () => {
    renderHook(() => useAttentionNotifications(undefined, undefined, false, enabledSettings))
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('does nothing while sleeping', async () => {
    renderHook(() => useAttentionNotifications('Mochi', { ...healthyStats, fullness: 10 }, true, enabledSettings))
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('does nothing when notifications are globally off', async () => {
    renderHook(() =>
      useAttentionNotifications('Mochi', { ...healthyStats, fullness: 10 }, false, { ...enabledSettings, global: false }),
    )
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('does nothing when the attention type is off', async () => {
    renderHook(() =>
      useAttentionNotifications('Mochi', { ...healthyStats, fullness: 10 }, false, { ...enabledSettings, attention: false }),
    )
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('does nothing when the Notification API is unsupported', async () => {
    stubNotificationSupport('unsupported')
    renderHook(() => useAttentionNotifications('Mochi', { ...healthyStats, fullness: 10 }, false, enabledSettings))
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('does nothing when permission was not granted', async () => {
    stubNotificationSupport('default')
    renderHook(() => useAttentionNotifications('Mochi', { ...healthyStats, fullness: 10 }, false, enabledSettings))
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('does nothing when every stat is healthy', async () => {
    renderHook(() => useAttentionNotifications('Mochi', healthyStats, false, enabledSettings))
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('notifies for a critically low stat, mentioning the pet name', async () => {
    renderHook(() => useAttentionNotifications('Mochi', { ...healthyStats, fullness: 10 }, false, enabledSettings))
    await act(async () => {}) // flush the already-resolved serviceWorker.ready microtask
    expect(showNotification).toHaveBeenCalledTimes(1)
    expect(showNotification).toHaveBeenCalledWith(
      'Catmagochi',
      expect.objectContaining({ body: expect.stringContaining('Mochi') }),
    )
  })

  it('prioritizes fullness > energy > cleanliness > happiness, like deriveMood', async () => {
    renderHook(() =>
      useAttentionNotifications(
        'Mochi',
        { fullness: 10, energy: 10, cleanliness: 10, happiness: 10 },
        false,
        enabledSettings,
      ),
    )
    await act(async () => {})
    expect(showNotification).toHaveBeenCalledTimes(1)
    expect(showNotification.mock.calls[0][1].body).toContain('hungry')
  })

  it('reports tired/dirty/sad for each individually-low stat', async () => {
    const cases: [Partial<PetStats>, string][] = [
      [{ energy: 10 }, 'exhausted'],
      [{ cleanliness: 10 }, 'bath'],
      [{ happiness: 10 }, 'feeling down'],
    ]
    for (const [override, expectedWord] of cases) {
      showNotification.mockClear()
      const { unmount } = renderHook(() =>
        useAttentionNotifications('Mochi', { ...healthyStats, ...override }, false, enabledSettings),
      )
      await act(async () => {})
      expect(showNotification).toHaveBeenCalledTimes(1)
      expect(showNotification.mock.calls[0][1].body).toContain(expectedWord)
      unmount()
    }
  })

  it('does nothing when the Service Worker API is unavailable', async () => {
    // @ts-expect-error simulate an environment without service worker support
    delete navigator.serviceWorker
    renderHook(() => useAttentionNotifications('Mochi', { ...healthyStats, fullness: 10 }, false, enabledSettings))
    await act(async () => {})
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('does not re-notify within the cooldown window, but does after it elapses', async () => {
    const { rerender } = renderHook(
      ({ stats }: { stats: PetStats }) => useAttentionNotifications('Mochi', stats, false, enabledSettings),
      { initialProps: { stats: { ...healthyStats, fullness: 10 } } },
    )
    await act(async () => {})
    expect(showNotification).toHaveBeenCalledTimes(1)

    // still critical, re-rendered with a "new" stats object -- should not re-fire yet
    rerender({ stats: { ...healthyStats, fullness: 9 } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000) // 10 min, still within the 30 min cooldown
    })
    expect(showNotification).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(21 * 60_000) // now >30 min since the first notification
    })
    // advancing time alone doesn't re-run the effect -- it only re-evaluates
    // the cooldown on the next render caused by a dependency actually changing
    rerender({ stats: { ...healthyStats, fullness: 8 } })
    await act(async () => {})
    expect(showNotification).toHaveBeenCalledTimes(2)
  })
})
