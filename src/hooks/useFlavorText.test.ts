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

describe('useFlavorText with extra lines', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // The hook calls Math.random three times per idle tick: the jittered delay,
  // the show-a-line chance, then the pick. Only the third one selects.
  function stubRolls(pick: number) {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0) // no jitter -> fires at IDLE_CHECK_MIN_MS
      .mockReturnValueOnce(0) // below FLAVOR_CHANCE -> show a line
      .mockReturnValueOnce(pick)
  }

  // Learned tricks join the idle pool, so the cat occasionally performs one
  // unprompted -- the payoff shows up even when nobody asked.
  it('can draw an idle line from the extra pool it is given', () => {
    const extra = ['practices her high five']
    // 'content' has no mood pool, so it falls back to GENERIC_FLAVOR; the
    // extras are appended, so the last index is ours.
    const poolSize = GENERIC_FLAVOR.length + extra.length
    stubRolls((poolSize - 1) / poolSize + 0.001)
    const { result } = renderHook(() => useFlavorText('content', extra))
    act(() => {
      vi.advanceTimersByTime(6_000)
    })
    expect(result.current).toBe('practices her high five')
  })

  it("still draws the mood's own lines when the pick lands there", () => {
    stubRolls(0)
    const { result } = renderHook(() => useFlavorText('content', ['practices her high five']))
    act(() => {
      vi.advanceTimersByTime(6_000)
    })
    expect(GENERIC_FLAVOR).toContain(result.current)
  })

  it('is unchanged when no extra pool is given', () => {
    stubRolls(0)
    const { result } = renderHook(() => useFlavorText('happy'))
    act(() => {
      vi.advanceTimersByTime(6_000)
    })
    expect(FLAVOR_TEXT.happy).toContain(result.current)
  })

  // App builds this array during render, so a fresh array of the same lines
  // must not restart the loop and blank the caption mid-display.
  it('does not restart the loop when an equivalent pool is passed again', () => {
    const extra = ['practices her high five']
    const poolSize = GENERIC_FLAVOR.length + extra.length
    stubRolls((poolSize - 1) / poolSize + 0.001)
    const { result, rerender } = renderHook(({ lines }) => useFlavorText('content', lines), {
      initialProps: { lines: [...extra] },
    })
    act(() => {
      vi.advanceTimersByTime(6_000)
    })
    expect(result.current).toBe('practices her high five')
    rerender({ lines: [...extra] })
    expect(result.current).toBe('practices her high five')
  })
})
