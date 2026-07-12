import { useCallback, useEffect, useRef, useState } from 'react'
import type { Mood, PetSave, PetStats } from '../types'

const SAVE_KEY = 'catmagochi-save-v1'
const TICK_MS = 5_000
const STAT_MIN = 0
const STAT_MAX = 100
const PET_COOLDOWN_MS = 2_500

// Decay/regen rates are per minute of elapsed real time.
const AWAKE_DECAY = { fullness: -2, happiness: -1.5, energy: -1, cleanliness: -1 }
const SLEEP_RATE = { fullness: -0.5, happiness: 0, energy: 4, cleanliness: -0.3 }

const clamp = (n: number) => Math.min(STAT_MAX, Math.max(STAT_MIN, n))

function defaultSave(name: string): PetSave {
  return {
    name,
    stats: { fullness: 80, happiness: 80, energy: 80, cleanliness: 80 },
    sleeping: false,
    lastUpdate: Date.now(),
    growth: 0,
  }
}

function loadSave(): PetSave | null {
  const raw = localStorage.getItem(SAVE_KEY)
  if (!raw) return null
  try {
    return { growth: 0, ...(JSON.parse(raw) as Partial<PetSave>) } as PetSave
  } catch {
    return null
  }
}

function applyElapsed(stats: PetStats, sleeping: boolean, elapsedMs: number): PetStats {
  // Cap catch-up so returning after days away doesn't require huge computation;
  // stats bottom/top out at the clamp anyway.
  const minutes = Math.min(elapsedMs / 60_000, 12 * 60)
  const rate = sleeping ? SLEEP_RATE : AWAKE_DECAY
  return {
    fullness: clamp(stats.fullness + rate.fullness * minutes),
    happiness: clamp(stats.happiness + rate.happiness * minutes),
    energy: clamp(stats.energy + rate.energy * minutes),
    cleanliness: clamp(stats.cleanliness + rate.cleanliness * minutes),
  }
}

export function deriveMood(stats: PetStats, sleeping: boolean): Mood {
  if (sleeping) return 'sleeping'
  if (stats.fullness < 25) return 'hungry'
  if (stats.energy < 25) return 'tired'
  if (stats.cleanliness < 25) return 'dirty'
  if (stats.happiness < 25) return 'sad'
  const avg = (stats.fullness + stats.happiness + stats.energy + stats.cleanliness) / 4
  return avg > 75 ? 'happy' : 'content'
}

export function usePet() {
  const [save, setSave] = useState<PetSave | null>(() => {
    const existing = loadSave()
    if (!existing) return null
    const elapsed = Date.now() - existing.lastUpdate
    return {
      ...existing,
      stats: applyElapsed(existing.stats, existing.sleeping, elapsed),
      lastUpdate: Date.now(),
    }
  })
  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    if (save) localStorage.setItem(SAVE_KEY, JSON.stringify(save))
  }, [save])

  useEffect(() => {
    const id = setInterval(() => {
      setSave((current) => {
        if (!current) return current
        const now = Date.now()
        const elapsed = now - current.lastUpdate
        return {
          ...current,
          stats: applyElapsed(current.stats, current.sleeping, elapsed),
          lastUpdate: now,
        }
      })
    }, TICK_MS)
    return () => clearInterval(id)
  }, [])

  const createPet = useCallback((name: string) => {
    setSave(defaultSave(name.trim() || 'Cat'))
  }, [])

  const feed = useCallback(() => {
    setSave((current) => {
      if (!current || current.sleeping) return current
      return {
        ...current,
        growth: current.growth + 3,
        stats: {
          ...current.stats,
          fullness: clamp(current.stats.fullness + 25),
          happiness: clamp(current.stats.happiness + 5),
        },
      }
    })
  }, [])

  const playGame = useCallback((hits: number) => {
    setSave((current) => {
      if (!current || current.sleeping) return current
      return {
        ...current,
        growth: current.growth + 1 + 2 * hits,
        stats: {
          ...current.stats,
          happiness: clamp(current.stats.happiness + 2 + 5 * hits),
          energy: clamp(current.stats.energy - 10),
          fullness: clamp(current.stats.fullness - 5),
          cleanliness: clamp(current.stats.cleanliness - 5),
        },
      }
    })
  }, [])

  const clean = useCallback(() => {
    setSave((current) => {
      if (!current || current.sleeping) return current
      return { ...current, growth: current.growth + 2, stats: { ...current.stats, cleanliness: clamp(current.stats.cleanliness + 30) } }
    })
  }, [])

  const toggleSleep = useCallback(() => {
    setSave((current) => (current ? { ...current, sleeping: !current.sleeping } : current))
  }, [])

  const lastPetAt = useRef(0)

  const pet = useCallback(() => {
    const current = saveRef.current
    if (!current || current.sleeping) return false
    const now = Date.now()
    if (now - lastPetAt.current < PET_COOLDOWN_MS) return false
    lastPetAt.current = now
    setSave((c) => (c ? { ...c, growth: c.growth + 1, stats: { ...c.stats, happiness: clamp(c.stats.happiness + 3) } } : c))
    return true
  }, [])

  const receiveMessage = useCallback(() => {
    setSave((current) =>
      current ? { ...current, stats: { ...current.stats, happiness: clamp(current.stats.happiness + 5) } } : current,
    )
  }, [])

  const mood = save ? deriveMood(save.stats, save.sleeping) : 'content'

  return { save, mood, createPet, feed, playGame, clean, toggleSleep, pet, receiveMessage }
}
