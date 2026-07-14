import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFlavorText } from './useFlavorText'
import { FLAVOR_TEXT, GENERIC_FLAVOR, MOOD_LABEL } from '../data/flavorText'
import type { Mood } from '../types'

describe('useFlavorText', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts showing the steady-state mood label', () => {
    const { result } = renderHook(() => useFlavorText('happy'))
    expect(result.current).toBe(MOOD_LABEL.happy)
  })

  it('resets to the new mood label immediately when mood changes', () => {
    const { result, rerender } = renderHook(({ mood }: { mood: Mood }) => useFlavorText(mood), {
      initialProps: { mood: 'happy' },
    })
    expect(result.current).toBe(MOOD_LABEL.happy)
    rerender({ mood: 'sad' })
    expect(result.current).toBe(MOOD_LABEL.sad)
  })

  it('swaps in a flavor line after the idle delay when the random chance hits', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { result } = renderHook(() => useFlavorText('happy'))
    act(() => {
      vi.advanceTimersByTime(6_000)
    })
    expect(result.current).toBe(FLAVOR_TEXT.happy![0])
  })

  it('reverts to the mood label after the flavor line has been shown', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { result } = renderHook(() => useFlavorText('happy'))
    act(() => {
      vi.advanceTimersByTime(6_000)
    })
    expect(result.current).toBe(FLAVOR_TEXT.happy![0])
    act(() => {
      vi.advanceTimersByTime(3_500)
    })
    expect(result.current).toBe(MOOD_LABEL.happy)
  })

  it('falls back to GENERIC_FLAVOR for moods with no dedicated flavor lines', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { result } = renderHook(() => useFlavorText('content'))
    act(() => {
      vi.advanceTimersByTime(6_000)
    })
    expect(result.current).toBe(GENERIC_FLAVOR[0])
  })

  it('stays on the mood label when the random chance misses, and keeps re-rolling', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // >= FLAVOR_CHANCE (0.55), never shows
    const { result } = renderHook(() => useFlavorText('happy'))
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current).toBe(MOOD_LABEL.happy)
  })

  it('cleans up pending timers on unmount without throwing', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { unmount } = renderHook(() => useFlavorText('happy'))
    unmount()
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(20_000)
      })
    }).not.toThrow()
  })
})
