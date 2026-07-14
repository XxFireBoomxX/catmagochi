import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useMessageHistory } from './useMessageHistory'
import type { RelayMessage } from '../types'

const HISTORY_KEY = 'catmagochi-message-history-v1'

const msg = (id: string, sentAt = Date.now()): RelayMessage => ({ id, text: `text-${id}`, sentAt })

describe('useMessageHistory', () => {
  it('starts empty when localStorage has nothing saved', () => {
    const { result } = renderHook(() => useMessageHistory())
    expect(result.current.history).toEqual([])
  })

  it('loads existing history from localStorage on mount', () => {
    const seeded = [msg('a'), msg('b')]
    localStorage.setItem(HISTORY_KEY, JSON.stringify(seeded))
    const { result } = renderHook(() => useMessageHistory())
    expect(result.current.history).toEqual(seeded)
  })

  it('ignores corrupt localStorage content and starts empty', () => {
    localStorage.setItem(HISTORY_KEY, 'not json{{')
    const { result } = renderHook(() => useMessageHistory())
    expect(result.current.history).toEqual([])
  })

  it('records a new message at the front of history and persists it', () => {
    const { result } = renderHook(() => useMessageHistory())
    const first = msg('first')
    act(() => result.current.record(first))
    expect(result.current.history).toEqual([first])
    act(() => result.current.record(msg('second')))
    expect(result.current.history.map((m) => m.id)).toEqual(['second', 'first'])

    const persisted = JSON.parse(localStorage.getItem(HISTORY_KEY)!)
    expect(persisted.map((m: RelayMessage) => m.id)).toEqual(['second', 'first'])
  })

  it('caps history at 50 entries, dropping the oldest', () => {
    const seeded = Array.from({ length: 50 }, (_, i) => msg(`old-${i}`))
    localStorage.setItem(HISTORY_KEY, JSON.stringify(seeded))
    const { result } = renderHook(() => useMessageHistory())
    act(() => result.current.record(msg('new')))
    expect(result.current.history).toHaveLength(50)
    expect(result.current.history[0].id).toBe('new')
    expect(result.current.history.some((m) => m.id === 'old-49')).toBe(false)
  })
})
