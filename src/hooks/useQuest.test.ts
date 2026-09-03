import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { todayKey, useQuest } from './useQuest'
import { ZONES } from '../data/zones'

const KEY = 'catmagochi-quest-v1'
const NOW = new Date('2026-09-03T09:00:00')
const kitchen = ZONES[0].id

const seed = (save: Record<string, unknown>) => localStorage.setItem(KEY, JSON.stringify(save))

describe('todayKey', () => {
  it('formats the local calendar day', () => {
    expect(todayKey(new Date('2026-09-03T23:30:00'))).toBe('2026-09-03')
  })

  it('pads single-digit months and days', () => {
    expect(todayKey(new Date('2026-01-05T10:00:00'))).toBe('2026-01-05')
  })
})

describe('useQuest', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts at level 1 with one skill and nothing cleared', () => {
    const { result } = renderHook(() => useQuest())
    expect(result.current.level).toBe(1)
    expect(result.current.xp).toBe(0)
    expect(result.current.skills).toHaveLength(1)
    expect(result.current.clearsFor(kitchen)).toBe(0)
  })

  it('banks xp and advances the zone on a win', () => {
    const { result } = renderHook(() => useQuest())
    act(() => {
      result.current.recordWin(kitchen, 30)
    })
    expect(result.current.xp).toBe(30)
    expect(result.current.clearsFor(kitchen)).toBe(1)
  })

  it('reports the levels gained so the panel can celebrate', () => {
    const { result } = renderHook(() => useQuest())
    let gained = 0
    act(() => {
      gained = result.current.recordWin(kitchen, 120).levelsGained
    })
    expect(gained).toBe(1)
    expect(result.current.level).toBe(2)
  })

  it('unlocks more skills as the level rises', () => {
    seed({ level: 4, xp: 0, zoneClears: {}, lastPlayDay: null })
    const { result } = renderHook(() => useQuest())
    expect(result.current.skills.length).toBeGreaterThan(1)
  })

  it('grows the cat max hp with the level', () => {
    seed({ level: 5, xp: 0, zoneClears: {}, lastPlayDay: null })
    const { result } = renderHook(() => useQuest())
    expect(result.current.maxHp).toBeGreaterThan(10)
  })

  // App fires the play care event on this, so unlimited fighting cannot
  // become an unlimited stat faucet.
  it('reports the first win of the day once, and not again', () => {
    const { result } = renderHook(() => useQuest())
    let first = false
    let second = false
    act(() => {
      first = result.current.recordWin(kitchen, 10).firstWinToday
    })
    act(() => {
      second = result.current.recordWin(kitchen, 10).firstWinToday
    })
    expect(first).toBe(true)
    expect(second).toBe(false)
  })

  it('reports a first win again the next day', () => {
    const { result } = renderHook(() => useQuest())
    act(() => {
      result.current.recordWin(kitchen, 10)
    })
    vi.setSystemTime(new Date('2026-09-04T09:00:00'))
    const { result: tomorrow } = renderHook(() => useQuest())
    let first = false
    act(() => {
      first = tomorrow.current.recordWin(kitchen, 10).firstWinToday
    })
    expect(first).toBe(true)
  })

  it('costs nothing but the fight when the cat loses', () => {
    const { result } = renderHook(() => useQuest())
    act(() => {
      result.current.recordWin(kitchen, 50)
    })
    act(() => {
      result.current.recordLoss()
    })
    expect(result.current.xp).toBe(50)
    expect(result.current.level).toBe(1)
    expect(result.current.clearsFor(kitchen)).toBe(1)
  })

  it('only lists zones the cat has reached', () => {
    const { result } = renderHook(() => useQuest())
    expect(result.current.unlockedZones.length).toBeGreaterThan(0)
    for (const zone of result.current.unlockedZones) {
      expect(zone.unlockLevel).toBeLessThanOrEqual(1)
    }
  })

  it('persists across a remount', () => {
    const { result } = renderHook(() => useQuest())
    act(() => {
      result.current.recordWin(kitchen, 40)
    })
    const { result: reloaded } = renderHook(() => useQuest())
    expect(reloaded.current.xp).toBe(40)
    expect(reloaded.current.clearsFor(kitchen)).toBe(1)
  })

  it.each(['null', '"a string"', '[]', '7', '{not json'])(
    'ignores the structurally invalid save %s and starts fresh',
    (raw) => {
      localStorage.setItem(KEY, raw)
      const { result } = renderHook(() => useQuest())
      expect(result.current.level).toBe(1)
      expect(result.current.xp).toBe(0)
    },
  )

  it('clamps a nonsensical level, xp and clear count rather than trusting them', () => {
    seed({ level: -3, xp: -100, zoneClears: { [kitchen]: -5 }, lastPlayDay: 42 })
    const { result } = renderHook(() => useQuest())
    expect(result.current.level).toBe(1)
    expect(result.current.xp).toBe(0)
    expect(result.current.clearsFor(kitchen)).toBe(0)
  })

  it('drops clears for a zone that no longer exists', () => {
    seed({ level: 1, xp: 0, zoneClears: { 'retired-zone': 4 }, lastPlayDay: null })
    const { result } = renderHook(() => useQuest())
    expect(result.current.clearsFor('retired-zone')).toBe(0)
  })

  it('keeps working when localStorage cannot be written', () => {
    const { result } = renderHook(() => useQuest())
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => {
      act(() => {
        result.current.recordWin(kitchen, 10)
      })
    }).not.toThrow()
    expect(result.current.xp).toBe(10)
  })

  it('starts fresh when localStorage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useQuest())
    expect(result.current.level).toBe(1)
  })
})
