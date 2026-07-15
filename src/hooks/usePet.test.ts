import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deriveMood, usePet } from './usePet'
import type { CareEventType, PetStats } from '../types'

const SAVE_KEY = 'catmagochi-save-v1'
const baseStats: PetStats = { fullness: 80, happiness: 80, energy: 80, cleanliness: 80 }

describe('deriveMood', () => {
  it('is sleeping whenever sleeping is true, overriding every other stat', () => {
    expect(deriveMood({ fullness: 0, happiness: 0, energy: 0, cleanliness: 0 }, true)).toBe('sleeping')
    expect(deriveMood(baseStats, true)).toBe('sleeping')
  })

  it('prioritizes hungry over tired/dirty/sad', () => {
    expect(deriveMood({ ...baseStats, fullness: 24, energy: 24, cleanliness: 24, happiness: 24 }, false)).toBe('hungry')
  })

  it('prioritizes tired over dirty/sad once fed', () => {
    expect(deriveMood({ ...baseStats, energy: 24, cleanliness: 24, happiness: 24 }, false)).toBe('tired')
  })

  it('prioritizes dirty over sad once fed and rested', () => {
    expect(deriveMood({ ...baseStats, cleanliness: 24, happiness: 24 }, false)).toBe('dirty')
  })

  it('is sad when only happiness is low', () => {
    expect(deriveMood({ ...baseStats, happiness: 24 }, false)).toBe('sad')
  })

  it('is happy when the average of all stats is above 75', () => {
    expect(deriveMood({ fullness: 100, happiness: 100, energy: 100, cleanliness: 100 }, false)).toBe('happy')
  })

  it('is content when average is 75 or below but nothing is critically low', () => {
    expect(deriveMood({ fullness: 50, happiness: 50, energy: 50, cleanliness: 50 }, false)).toBe('content')
  })

  it('treats exactly 25 as not-low (boundary is strictly less than 25)', () => {
    expect(deriveMood({ fullness: 25, happiness: 25, energy: 25, cleanliness: 25 }, false)).toBe('content')
  })

  it('treats exactly 75 average as content, not happy (boundary is strictly greater than 75)', () => {
    expect(deriveMood({ fullness: 75, happiness: 75, energy: 75, cleanliness: 75 }, false)).toBe('content')
  })
})

describe('usePet', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with no save when localStorage is empty', () => {
    const { result } = renderHook(() => usePet())
    expect(result.current.save).toBeNull()
    expect(result.current.mood).toBe('content')
  })

  it('creates a pet with default stats and trims the given name', () => {
    const { result } = renderHook(() => usePet())
    act(() => result.current.createPet('  Whiskers  '))
    expect(result.current.save).toMatchObject({
      name: 'Whiskers',
      sleeping: false,
      growth: 0,
      stats: baseStats,
    })
  })

  it('starts a new pet with adoptedAt set to now and all action counters at zero', () => {
    const { result } = renderHook(() => usePet())
    act(() => result.current.createPet('Whiskers'))
    expect(result.current.save).toMatchObject({
      adoptedAt: Date.now(),
      totalFeeds: 0,
      totalPlays: 0,
      totalCleans: 0,
      totalPets: 0,
    })
  })

  it('falls back to "Cat" when the given name is blank', () => {
    const { result } = renderHook(() => usePet())
    act(() => result.current.createPet('   '))
    expect(result.current.save?.name).toBe('Cat')
  })

  it('persists the save to localStorage on every change', () => {
    const { result } = renderHook(() => usePet())
    act(() => result.current.createPet('Mochi'))
    const raw = localStorage.getItem(SAVE_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!)).toMatchObject({ name: 'Mochi' })
  })

  it('loads an existing save from localStorage on mount', () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        name: 'Existing',
        stats: baseStats,
        sleeping: false,
        lastUpdate: Date.now(),
        growth: 10,
      }),
    )
    const { result } = renderHook(() => usePet())
    expect(result.current.save?.name).toBe('Existing')
    expect(result.current.save?.growth).toBe(10)
  })

  it('merges growth: 0 for saves from before the growth feature existed', () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        name: 'Old',
        stats: baseStats,
        sleeping: false,
        lastUpdate: Date.now(),
      }),
    )
    const { result } = renderHook(() => usePet())
    expect(result.current.save?.growth).toBe(0)
  })

  it('merges defaults for adoptedAt/counters on saves from before those fields existed', () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        name: 'Old',
        stats: baseStats,
        sleeping: false,
        lastUpdate: Date.now(),
        growth: 10,
      }),
    )
    const { result } = renderHook(() => usePet())
    expect(result.current.save).toMatchObject({
      adoptedAt: Date.now(),
      totalFeeds: 0,
      totalPlays: 0,
      totalCleans: 0,
      totalPets: 0,
    })
  })

  it('ignores a corrupt save and starts fresh', () => {
    localStorage.setItem(SAVE_KEY, '{not valid json')
    const { result } = renderHook(() => usePet())
    expect(result.current.save).toBeNull()
  })

  it('catches up stats for elapsed time since lastUpdate on load, awake decay', () => {
    const tenMinutesAgo = Date.now() - 10 * 60_000
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        name: 'Catchup',
        stats: baseStats,
        sleeping: false,
        lastUpdate: tenMinutesAgo,
        growth: 0,
      }),
    )
    const { result } = renderHook(() => usePet())
    // AWAKE_DECAY.fullness = -2/min * 10min = -20
    expect(result.current.save?.stats.fullness).toBe(60)
    expect(result.current.save?.stats.happiness).toBe(65)
    expect(result.current.save?.stats.energy).toBe(70)
    expect(result.current.save?.stats.cleanliness).toBe(70)
  })

  it('catches up stats for elapsed time since lastUpdate on load, sleep regen', () => {
    const tenMinutesAgo = Date.now() - 10 * 60_000
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        name: 'Sleeper',
        stats: baseStats,
        sleeping: true,
        lastUpdate: tenMinutesAgo,
        growth: 0,
      }),
    )
    const { result } = renderHook(() => usePet())
    // SLEEP_RATE.energy = +4/min * 10min = +40, clamped to 100
    expect(result.current.save?.stats.energy).toBe(100)
    expect(result.current.save?.stats.happiness).toBe(80)
  })

  it('caps catch-up at 12 simulated hours for very long absences', () => {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60_000
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        name: 'LongGone',
        stats: baseStats,
        sleeping: false,
        lastUpdate: twoDaysAgo,
        growth: 0,
      }),
    )
    const { result } = renderHook(() => usePet())
    // Capped at 12h = 720min of decay; fullness would go deeply negative
    // uncapped, but everything clamps to 0 regardless once capped.
    expect(result.current.save?.stats.fullness).toBe(0)
  })

  it('the tick interval is a no-op if it fires before any pet has been created', () => {
    const { result } = renderHook(() => usePet())
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(5_000)
      })
    }).not.toThrow()
    expect(result.current.save).toBeNull()
  })

  it('recomputes stats on each tick based on elapsed real time', () => {
    const { result } = renderHook(() => usePet())
    act(() => result.current.createPet('Ticker'))
    act(() => {
      vi.advanceTimersByTime(60_000) // 1 minute, one 5s tick multiple
    })
    expect(result.current.save?.stats.fullness).toBeLessThan(80)
  })

  describe('feed', () => {
    it('increases fullness and happiness, and adds growth', () => {
      const { result } = renderHook(() => usePet())
      act(() => result.current.createPet('Feeder'))
      act(() => result.current.feed())
      expect(result.current.save?.stats.fullness).toBe(100)
      expect(result.current.save?.stats.happiness).toBe(85)
      expect(result.current.save?.growth).toBe(3)
      expect(result.current.save?.totalFeeds).toBe(1)
    })

    it('clamps fullness at 100', () => {
      const { result } = renderHook(() => usePet())
      act(() => result.current.createPet('Full'))
      act(() => result.current.feed())
      act(() => result.current.feed())
      expect(result.current.save?.stats.fullness).toBe(100)
    })

    it('does nothing while sleeping', () => {
      const { result } = renderHook(() => usePet())
      act(() => result.current.createPet('Sleepy'))
      act(() => result.current.toggleSleep())
      act(() => result.current.feed())
      expect(result.current.save?.stats.fullness).toBe(80)
      expect(result.current.save?.growth).toBe(0)
    })

    it('is a no-op when there is no save yet', () => {
      const { result } = renderHook(() => usePet())
      act(() => result.current.feed())
      expect(result.current.save).toBeNull()
    })

    it('emits a care event with a fresh id on success', () => {
      const onCareEvent = vi.fn()
      const { result } = renderHook(() => usePet(onCareEvent))
      act(() => result.current.createPet('Feeder'))
      act(() => result.current.feed())
      expect(onCareEvent).toHaveBeenCalledTimes(1)
      const [id, type, hits] = onCareEvent.mock.calls[0]
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
      expect(type).toBe('feed')
      expect(hits).toBeUndefined()
    })

    it('does not emit a care event while sleeping', () => {
      const onCareEvent = vi.fn()
      const { result } = renderHook(() => usePet(onCareEvent))
      act(() => result.current.createPet('Sleepy'))
      act(() => result.current.toggleSleep())
      act(() => result.current.feed())
      expect(onCareEvent).not.toHaveBeenCalled()
    })
  })

  describe('playGame', () => {
    it('scales happiness gain and growth with hits, and costs energy/fullness/cleanliness', () => {
      const { result } = renderHook(() => usePet())
      act(() => result.current.createPet('Player'))
      act(() => result.current.playGame(3))
      expect(result.current.save?.stats.happiness).toBe(97) // 80 + 2 + 5*3 = 97
      expect(result.current.save?.stats.energy).toBe(70)
      expect(result.current.save?.stats.fullness).toBe(75)
      expect(result.current.save?.stats.cleanliness).toBe(75)
      expect(result.current.save?.growth).toBe(7) // 1 + 2*3
      expect(result.current.save?.totalPlays).toBe(1)
    })

    it('still applies a minimum growth/happiness bump on zero hits', () => {
      const { result } = renderHook(() => usePet())
      act(() => result.current.createPet('Loser'))
      act(() => result.current.playGame(0))
      expect(result.current.save?.growth).toBe(1)
      expect(result.current.save?.stats.happiness).toBe(82)
    })

    it('does nothing while sleeping', () => {
      const { result } = renderHook(() => usePet())
      act(() => result.current.createPet('Sleepy'))
      act(() => result.current.toggleSleep())
      act(() => result.current.playGame(3))
      expect(result.current.save?.growth).toBe(0)
    })

    it('emits a care event carrying the hit count', () => {
      const onCareEvent = vi.fn()
      const { result } = renderHook(() => usePet(onCareEvent))
      act(() => result.current.createPet('Player'))
      act(() => result.current.playGame(3))
      expect(onCareEvent).toHaveBeenCalledTimes(1)
      const [, type, hits] = onCareEvent.mock.calls[0]
      expect(type).toBe('play')
      expect(hits).toBe(3)
    })
  })

  describe('clean', () => {
    it('increases cleanliness and adds growth', () => {
      const { result } = renderHook(() => usePet())
      act(() => result.current.createPet('Cleaner'))
      act(() => result.current.clean())
      expect(result.current.save?.stats.cleanliness).toBe(100)
      expect(result.current.save?.growth).toBe(2)
      expect(result.current.save?.totalCleans).toBe(1)
    })

    it('does nothing while sleeping', () => {
      const { result } = renderHook(() => usePet())
      act(() => result.current.createPet('Sleepy'))
      act(() => result.current.toggleSleep())
      act(() => result.current.clean())
      expect(result.current.save?.growth).toBe(0)
    })

    it('emits a care event on success', () => {
      const onCareEvent = vi.fn()
      const { result } = renderHook(() => usePet(onCareEvent))
      act(() => result.current.createPet('Cleaner'))
      act(() => result.current.clean())
      expect(onCareEvent).toHaveBeenCalledTimes(1)
      expect(onCareEvent.mock.calls[0][1]).toBe('clean')
    })
  })

  describe('toggleSleep', () => {
    it('flips the sleeping flag even when already asleep (used to wake up)', () => {
      const { result } = renderHook(() => usePet())
      act(() => result.current.createPet('Napper'))
      expect(result.current.save?.sleeping).toBe(false)
      act(() => result.current.toggleSleep())
      expect(result.current.save?.sleeping).toBe(true)
      act(() => result.current.toggleSleep())
      expect(result.current.save?.sleeping).toBe(false)
    })

    it('is a no-op when there is no save yet', () => {
      const { result } = renderHook(() => usePet())
      act(() => result.current.toggleSleep())
      expect(result.current.save).toBeNull()
    })
  })

  describe('pet', () => {
    it('applies a happiness bump and growth, returning true', () => {
      const { result } = renderHook(() => usePet())
      act(() => result.current.createPet('Pettable'))
      let applied: boolean | undefined
      act(() => {
        applied = result.current.pet()
      })
      expect(applied).toBe(true)
      expect(result.current.save?.stats.happiness).toBe(83)
      expect(result.current.save?.growth).toBe(1)
      expect(result.current.save?.totalPets).toBe(1)
    })

    it('is cooldown-gated and returns false when petted again too soon', () => {
      const { result } = renderHook(() => usePet())
      act(() => result.current.createPet('Pettable'))
      act(() => {
        result.current.pet()
      })
      let secondApplied: boolean | undefined
      act(() => {
        secondApplied = result.current.pet()
      })
      expect(secondApplied).toBe(false)
      expect(result.current.save?.growth).toBe(1)
    })

    it('applies again after the cooldown elapses', () => {
      const { result } = renderHook(() => usePet())
      act(() => result.current.createPet('Pettable'))
      act(() => {
        result.current.pet()
      })
      act(() => {
        vi.advanceTimersByTime(3_000)
      })
      let thirdApplied: boolean | undefined
      act(() => {
        thirdApplied = result.current.pet()
      })
      expect(thirdApplied).toBe(true)
      expect(result.current.save?.growth).toBe(2)
    })

    it('returns false and does nothing while sleeping', () => {
      const { result } = renderHook(() => usePet())
      act(() => result.current.createPet('Sleepy'))
      act(() => result.current.toggleSleep())
      let applied: boolean | undefined
      act(() => {
        applied = result.current.pet()
      })
      expect(applied).toBe(false)
    })

    it('returns false when there is no save yet', () => {
      const { result } = renderHook(() => usePet())
      let applied: boolean | undefined
      act(() => {
        applied = result.current.pet()
      })
      expect(applied).toBe(false)
    })

    it('emits a care event only when the pet actually applies', () => {
      const onCareEvent = vi.fn()
      const { result } = renderHook(() => usePet(onCareEvent))
      act(() => result.current.createPet('Pettable'))
      act(() => {
        result.current.pet()
      })
      expect(onCareEvent).toHaveBeenCalledTimes(1)
      expect(onCareEvent.mock.calls[0][1]).toBe('pet')

      // blocked by cooldown -- no second event
      act(() => {
        result.current.pet()
      })
      expect(onCareEvent).toHaveBeenCalledTimes(1)
    })
  })

  describe('applyRemoteEvent', () => {
    it('applies the same delta a local action would, keyed by care event type', () => {
      const { result } = renderHook(() => usePet())
      act(() => result.current.createPet('Remote'))
      act(() => {
        result.current.applyRemoteEvent('evt-1', 'feed')
      })
      expect(result.current.save?.stats.fullness).toBe(100)
      expect(result.current.save?.stats.happiness).toBe(85)
      expect(result.current.save?.growth).toBe(3)
      expect(result.current.save?.totalFeeds).toBe(1)
    })

    it('applies a play event using the given hit count', () => {
      const { result } = renderHook(() => usePet())
      act(() => result.current.createPet('Remote'))
      act(() => {
        result.current.applyRemoteEvent('evt-play', 'play', 3)
      })
      expect(result.current.save?.growth).toBe(7)
      expect(result.current.save?.stats.happiness).toBe(97)
    })

    it('is idempotent: replaying the same event id is a no-op the second time', () => {
      const { result } = renderHook(() => usePet())
      act(() => result.current.createPet('Remote'))
      act(() => {
        result.current.applyRemoteEvent('evt-dup', 'clean')
      })
      expect(result.current.save?.growth).toBe(2)
      let secondResult: boolean | undefined
      act(() => {
        secondResult = result.current.applyRemoteEvent('evt-dup', 'clean')
      })
      expect(secondResult).toBe(false)
      expect(result.current.save?.growth).toBe(2)
    })

    it('deduplicates a remote event that echoes back an id this device already emitted locally', () => {
      const onCareEvent = vi.fn()
      const { result } = renderHook(() => usePet(onCareEvent))
      act(() => result.current.createPet('Remote'))
      act(() => result.current.feed())
      const emittedId = onCareEvent.mock.calls[0][0] as string
      expect(result.current.save?.growth).toBe(3)

      let echoApplied: boolean | undefined
      act(() => {
        echoApplied = result.current.applyRemoteEvent(emittedId, 'feed')
      })
      expect(echoApplied).toBe(false)
      expect(result.current.save?.growth).toBe(3)
    })

    it('applies even while sleeping, unlike local actions', () => {
      const { result } = renderHook(() => usePet())
      act(() => result.current.createPet('Sleepy'))
      act(() => result.current.toggleSleep())
      act(() => {
        result.current.applyRemoteEvent('evt-asleep', 'pet')
      })
      expect(result.current.save?.growth).toBe(1)
      expect(result.current.save?.totalPets).toBe(1)
    })

    it('is a no-op when there is no save yet', () => {
      const { result } = renderHook(() => usePet())
      act(() => {
        result.current.applyRemoteEvent('evt-nosave', 'feed')
      })
      expect(result.current.save).toBeNull()
    })

    it('covers every synced care event type', () => {
      const { result } = renderHook(() => usePet())
      act(() => result.current.createPet('AllTypes'))
      const types: CareEventType[] = ['feed', 'clean', 'pet', 'play']
      for (const type of types) {
        act(() => {
          result.current.applyRemoteEvent(`evt-${type}`, type, type === 'play' ? 1 : undefined)
        })
      }
      expect(result.current.save?.totalFeeds).toBe(1)
      expect(result.current.save?.totalCleans).toBe(1)
      expect(result.current.save?.totalPets).toBe(1)
      expect(result.current.save?.totalPlays).toBe(1)
    })
  })

  describe('receiveMessage', () => {
    it('increases happiness without adding growth', () => {
      const { result } = renderHook(() => usePet())
      act(() => result.current.createPet('Recipient'))
      act(() => result.current.receiveMessage())
      expect(result.current.save?.stats.happiness).toBe(85)
      expect(result.current.save?.growth).toBe(0)
    })

    it('is a no-op when there is no save yet', () => {
      const { result } = renderHook(() => usePet())
      act(() => result.current.receiveMessage())
      expect(result.current.save).toBeNull()
    })
  })

  describe('mood integration', () => {
    it('reflects the derived mood from the live save', () => {
      const { result } = renderHook(() => usePet())
      act(() => result.current.createPet('Moody'))
      // default stats are all 80, which averages above the happy threshold
      expect(result.current.mood).toBe('happy')
      act(() => result.current.toggleSleep())
      expect(result.current.mood).toBe('sleeping')
    })
  })
})
