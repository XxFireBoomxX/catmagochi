import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { todayKey, useTricks } from './useTricks'
import { TRICKS, TRICK_POINTS } from '../data/tricks'

const KEY = 'catmagochi-tricks-v1'
const NOW = new Date('2026-09-02T09:00:00')

function seed(save: Record<string, unknown>) {
  localStorage.setItem(KEY, JSON.stringify(save))
}

describe('todayKey', () => {
  it('formats the local calendar day', () => {
    expect(todayKey(new Date('2026-09-02T23:30:00'))).toBe('2026-09-02')
  })

  it('pads single-digit months and days', () => {
    expect(todayKey(new Date('2026-01-05T10:00:00'))).toBe('2026-01-05')
  })
})

describe('useTricks', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts on the first trick with a lesson available', () => {
    const { result } = renderHook(() => useTricks())
    expect(result.current.currentTrick?.id).toBe(TRICKS[0].id)
    expect(result.current.lessonAvailable).toBe(true)
    expect(result.current.progress).toBe(0)
    expect(result.current.learnedTricks).toEqual([])
  })

  it("spends the day's lesson and adds points", () => {
    const { result } = renderHook(() => useTricks())
    act(() => {
      result.current.recordLesson('almost')
    })
    expect(result.current.progress).toBe(1)
    expect(result.current.lessonAvailable).toBe(false)
  })

  it('adds nothing for a wasted lesson but still spends the day', () => {
    const { result } = renderHook(() => useTricks())
    act(() => {
      result.current.recordLesson('nothing')
    })
    expect(result.current.progress).toBe(0)
    expect(result.current.lessonAvailable).toBe(false)
  })

  it('offers a lesson again the next day, keeping the progress', () => {
    const { result } = renderHook(() => useTricks())
    act(() => {
      result.current.recordLesson('almost')
    })
    vi.setSystemTime(new Date('2026-09-03T09:00:00'))
    const { result: nextDay } = renderHook(() => useTricks())
    expect(nextDay.current.lessonAvailable).toBe(true)
    expect(nextDay.current.progress).toBe(1)
  })

  it('learns the trick once the points are earned and moves to the next', () => {
    seed({ currentTrickId: TRICKS[0].id, progress: TRICK_POINTS - 1, learned: [], lastLessonDay: null })
    const { result } = renderHook(() => useTricks())
    let learned: ReturnType<typeof result.current.recordLesson>
    act(() => {
      learned = result.current.recordLesson('almost')
    })
    expect(learned!.id).toBe(TRICKS[0].id)
    expect(result.current.learnedTricks.map((t) => t.id)).toEqual([TRICKS[0].id])
    expect(result.current.currentTrick?.id).toBe(TRICKS[1].id)
    expect(result.current.progress).toBe(0)
  })

  it('reports no trick learned when the lesson did not finish one', () => {
    const { result } = renderHook(() => useTricks())
    let learned: unknown
    act(() => {
      learned = result.current.recordLesson('almost')
    })
    expect(learned).toBeNull()
  })

  it('does not carry a surplus into the next trick', () => {
    seed({ currentTrickId: TRICKS[0].id, progress: TRICK_POINTS - 1, learned: [], lastLessonDay: null })
    const { result } = renderHook(() => useTricks())
    act(() => {
      result.current.recordLesson('learned') // +2 against 1 point remaining
    })
    expect(result.current.progress).toBe(0)
  })

  it('reports no current trick and no lesson once every one is learned', () => {
    seed({ currentTrickId: null, progress: 0, learned: TRICKS.map((t) => t.id), lastLessonDay: null })
    const { result } = renderHook(() => useTricks())
    expect(result.current.currentTrick).toBeNull()
    expect(result.current.lessonAvailable).toBe(false)
    expect(result.current.learnedTricks).toHaveLength(TRICKS.length)
  })

  it('persists progress across a remount', () => {
    const { result } = renderHook(() => useTricks())
    act(() => {
      result.current.recordLesson('learned')
    })
    const { result: reloaded } = renderHook(() => useTricks())
    expect(reloaded.current.progress).toBe(2)
  })

  it.each(['null', '"a string"', '[]', '42', '{not json'])(
    'ignores the structurally invalid save %s and starts fresh',
    (raw) => {
      localStorage.setItem(KEY, raw)
      const { result } = renderHook(() => useTricks())
      expect(result.current.currentTrick?.id).toBe(TRICKS[0].id)
      expect(result.current.progress).toBe(0)
    },
  )

  // A trick removed from the curriculum must not wedge the state on an id
  // that no longer resolves.
  it('drops a learned id that is no longer in the curriculum', () => {
    seed({ currentTrickId: null, progress: 0, learned: ['retired-trick'], lastLessonDay: null })
    const { result } = renderHook(() => useTricks())
    expect(result.current.learnedTricks).toEqual([])
    expect(result.current.currentTrick?.id).toBe(TRICKS[0].id)
  })

  // currentTrickId is recomputed from `learned` rather than trusted, so a
  // save that disagrees with itself resolves to the curriculum's answer.
  it('recomputes the current trick when the stored id contradicts the learned list', () => {
    seed({ currentTrickId: TRICKS[5].id, progress: 3, learned: [TRICKS[0].id], lastLessonDay: null })
    const { result } = renderHook(() => useTricks())
    expect(result.current.currentTrick?.id).toBe(TRICKS[1].id)
  })

  it('treats a negative stored progress as zero', () => {
    seed({ currentTrickId: TRICKS[0].id, progress: -5, learned: [], lastLessonDay: null })
    const { result } = renderHook(() => useTricks())
    expect(result.current.progress).toBe(0)
  })

  it('keeps working when localStorage cannot be written', () => {
    const { result } = renderHook(() => useTricks())
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => {
      act(() => {
        result.current.recordLesson('almost')
      })
    }).not.toThrow()
    expect(result.current.progress).toBe(1)
  })

  it('starts fresh when localStorage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useTricks())
    expect(result.current.currentTrick?.id).toBe(TRICKS[0].id)
  })
})
