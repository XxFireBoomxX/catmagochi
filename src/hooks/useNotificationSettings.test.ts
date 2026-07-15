import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useNotificationSettings } from './useNotificationSettings'

const SETTINGS_KEY = 'catmagochi-notification-settings-v1'

describe('useNotificationSettings', () => {
  it('defaults to notifications off globally, but per-type flags on', () => {
    const { result } = renderHook(() => useNotificationSettings())
    expect(result.current.settings).toEqual({ global: false, message: true, attention: true, update: true })
  })

  it('loads existing settings from localStorage', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ global: true, message: false, attention: true, update: false }))
    const { result } = renderHook(() => useNotificationSettings())
    expect(result.current.settings).toEqual({ global: true, message: false, attention: true, update: false })
  })

  it('merges defaults for any missing keys (forward compatibility)', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ global: true }))
    const { result } = renderHook(() => useNotificationSettings())
    expect(result.current.settings).toEqual({ global: true, message: true, attention: true, update: true })
  })

  it('ignores corrupt localStorage content and falls back to defaults', () => {
    localStorage.setItem(SETTINGS_KEY, 'not json{{')
    const { result } = renderHook(() => useNotificationSettings())
    expect(result.current.settings.global).toBe(false)
  })

  it('update() patches settings and persists the result', () => {
    const { result } = renderHook(() => useNotificationSettings())
    act(() => result.current.update({ global: true }))
    expect(result.current.settings.global).toBe(true)
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).global).toBe(true)

    act(() => result.current.update({ message: false }))
    expect(result.current.settings).toEqual({ global: true, message: false, attention: true, update: true })
  })
})
