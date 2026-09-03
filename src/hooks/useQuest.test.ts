import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { todayKey, useQuest } from './useQuest'
import { ZONES } from '../data/zones'
import { ITEM_CAP } from '../data/items'

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

// --- slice 2: the bag ---

describe('useQuest bag', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts empty with nothing worn', () => {
    const { result } = renderHook(() => useQuest())
    expect(result.current.bag).toEqual({})
    expect(result.current.worn).toBeNull()
  })

  it('adds loot to the bag', () => {
    const { result } = renderHook(() => useQuest())
    act(() => {
      result.current.addLoot('fish-scrap')
    })
    expect(result.current.bag['fish-scrap']).toBe(1)
  })

  it('stacks a repeat drop', () => {
    const { result } = renderHook(() => useQuest())
    act(() => {
      result.current.addLoot('fish-scrap')
    })
    act(() => {
      result.current.addLoot('fish-scrap')
    })
    expect(result.current.bag['fish-scrap']).toBe(2)
  })

  it('ignores an empty drop', () => {
    const { result } = renderHook(() => useQuest())
    act(() => {
      result.current.addLoot(null)
    })
    expect(result.current.bag).toEqual({})
  })

  it('ignores a drop it does not recognise', () => {
    const { result } = renderHook(() => useQuest())
    act(() => {
      result.current.addLoot('not-an-item')
    })
    expect(result.current.bag).toEqual({})
  })

  // Display concern, not difficulty: counts stay one character wide.
  it('caps a stack rather than growing forever', () => {
    const { result } = renderHook(() => useQuest())
    for (let i = 0; i < ITEM_CAP + 5; i++) {
      act(() => {
        result.current.addLoot('fish-scrap')
      })
    }
    expect(result.current.bag['fish-scrap']).toBe(ITEM_CAP)
  })

  it('spends what a fight used', () => {
    const { result } = renderHook(() => useQuest())
    act(() => {
      result.current.addLoot('bottle-cap')
    })
    act(() => {
      result.current.addLoot('bottle-cap')
    })
    act(() => {
      result.current.consume(['bottle-cap'])
    })
    expect(result.current.bag['bottle-cap']).toBe(1)
  })

  it('removes the entry entirely when the last one is used', () => {
    const { result } = renderHook(() => useQuest())
    act(() => {
      result.current.addLoot('bottle-cap')
    })
    act(() => {
      result.current.consume(['bottle-cap'])
    })
    expect(result.current.bag['bottle-cap']).toBeUndefined()
  })

  it('never goes negative on an item it does not hold', () => {
    const { result } = renderHook(() => useQuest())
    act(() => {
      result.current.consume(['bottle-cap', 'bottle-cap'])
    })
    expect(result.current.bag['bottle-cap']).toBeUndefined()
  })

  it('wears a trinket, and swaps it for another', () => {
    const { result } = renderHook(() => useQuest())
    act(() => {
      result.current.wear('rat-tooth')
    })
    expect(result.current.worn).toBe('rat-tooth')
    act(() => {
      result.current.wear('bent-whisker')
    })
    expect(result.current.worn).toBe('bent-whisker')
  })

  it('takes a trinket off', () => {
    const { result } = renderHook(() => useQuest())
    act(() => {
      result.current.wear('rat-tooth')
    })
    act(() => {
      result.current.wear(null)
    })
    expect(result.current.worn).toBeNull()
  })

  it('refuses to wear a consumable', () => {
    const { result } = renderHook(() => useQuest())
    act(() => {
      result.current.wear('fish-scrap')
    })
    expect(result.current.worn).toBeNull()
  })

  it('persists the bag and the worn trinket across a remount', () => {
    const { result } = renderHook(() => useQuest())
    act(() => {
      result.current.addLoot('rat-tooth')
    })
    act(() => {
      result.current.wear('rat-tooth')
    })
    const { result: reloaded } = renderHook(() => useQuest())
    expect(reloaded.current.bag['rat-tooth']).toBe(1)
    expect(reloaded.current.worn).toBe('rat-tooth')
  })

  it('cleans a corrupt bag rather than trusting it', () => {
    seed({
      level: 1,
      xp: 0,
      zoneClears: {},
      lastPlayDay: null,
      bag: { 'fish-scrap': 999, 'not-an-item': 3, 'bottle-cap': -4, 'catnip-leaf': 'lots' },
      worn: 'fish-scrap',
    })
    const { result } = renderHook(() => useQuest())
    expect(result.current.bag['fish-scrap']).toBe(ITEM_CAP)
    expect(result.current.bag['not-an-item']).toBeUndefined()
    expect(result.current.bag['bottle-cap']).toBeUndefined()
    expect(result.current.bag['catnip-leaf']).toBeUndefined()
    // a consumable is not something you can be wearing
    expect(result.current.worn).toBeNull()
  })
})

// Ending a fight calls all three in one handler. They must compose: an
// earlier implementation spread a stale saveRef in each, so the last call
// silently discarded the other two.
describe('useQuest mutations compose within one handler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the spend, the drop and the win when all three happen together', () => {
    const { result } = renderHook(() => useQuest())
    act(() => {
      result.current.addLoot('bottle-cap')
    })
    act(() => {
      result.current.addLoot('bottle-cap')
    })
    act(() => {
      // exactly the sequence QuestPanel runs when a fight ends
      result.current.consume(['bottle-cap'])
      result.current.addLoot('fish-scrap')
      result.current.recordWin(kitchen, 30)
    })
    expect(result.current.bag['bottle-cap']).toBe(1)
    expect(result.current.bag['fish-scrap']).toBe(1)
    expect(result.current.xp).toBe(30)
    expect(result.current.clearsFor(kitchen)).toBe(1)
  })
})
