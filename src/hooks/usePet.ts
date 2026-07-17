import { useCallback, useEffect, useRef, useState } from 'react'
import type { CareEventType, Mood, PetSave, PetStats } from '../types'

const SAVE_KEY = 'catmagochi-save-v1'
const TICK_MS = 5_000
const STAT_MIN = 0
const STAT_MAX = 100
const PET_COOLDOWN_MS = 2_500

// Decay/regen rates are per minute of elapsed real time.
const AWAKE_DECAY = { fullness: -0.3, happiness: -0.2, energy: -0.15, cleanliness: -0.15 }
const SLEEP_RATE = { fullness: -0.1, happiness: 0, energy: 4, cleanliness: -0.05 }

const clamp = (n: number) => Math.min(STAT_MAX, Math.max(STAT_MIN, n))

function defaultSave(name: string): PetSave {
  return {
    name,
    stats: { fullness: 80, happiness: 80, energy: 80, cleanliness: 80 },
    sleeping: false,
    lastUpdate: Date.now(),
    growth: 0,
    adoptedAt: Date.now(),
    totalFeeds: 0,
    totalPlays: 0,
    totalCleans: 0,
    totalPets: 0,
  }
}

function loadSave(): PetSave | null {
  const raw = localStorage.getItem(SAVE_KEY)
  if (!raw) return null
  try {
    // Saves from before a given field existed merge in a default -- adoptedAt
    // can't recover the real original date, so it just starts counting from
    // whenever the save is first loaded post-upgrade (best-effort, not exact).
    return {
      growth: 0,
      adoptedAt: Date.now(),
      totalFeeds: 0,
      totalPlays: 0,
      totalCleans: 0,
      totalPets: 0,
      ...(JSON.parse(raw) as Partial<PetSave>),
    } as PetSave
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

// The delta each care action applies -- shared between locally-triggered
// actions and remote events replayed from another device (see usePet's
// applyRemoteEvent), so both sides of a sync stay identical.
function applyCareEvent(save: PetSave, type: CareEventType): PetSave {
  switch (type) {
    case 'feed':
      return {
        ...save,
        growth: save.growth + 3,
        totalFeeds: save.totalFeeds + 1,
        stats: {
          ...save.stats,
          fullness: clamp(save.stats.fullness + 25),
          happiness: clamp(save.stats.happiness + 5),
        },
      }
    case 'clean':
      return {
        ...save,
        growth: save.growth + 2,
        totalCleans: save.totalCleans + 1,
        stats: { ...save.stats, cleanliness: clamp(save.stats.cleanliness + 30) },
      }
    case 'pet':
      return {
        ...save,
        growth: save.growth + 1,
        totalPets: save.totalPets + 1,
        stats: { ...save.stats, happiness: clamp(save.stats.happiness + 3) },
      }
    case 'play':
      // A quick "thinking of you" nudge (see NudgePicker), not a skill-based
      // mini-game anymore -- a flat reward like every other action, weighted
      // toward happiness since that's the point of it. Light costs elsewhere
      // keep it from being a strictly-better feed/clean substitute.
      return {
        ...save,
        growth: save.growth + 3,
        totalPlays: save.totalPlays + 1,
        stats: {
          ...save.stats,
          happiness: clamp(save.stats.happiness + 10),
          energy: clamp(save.stats.energy - 5),
          fullness: clamp(save.stats.fullness - 3),
          cleanliness: clamp(save.stats.cleanliness - 3),
        },
      }
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

export type OnCareEvent = (id: string, type: CareEventType) => void

export function usePet(onCareEvent?: OnCareEvent) {
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
  // Care events already applied to this save -- populated both when this
  // device emits its own event and when it replays one from another
  // device, so a remote echo of our own action (or a redelivered-after-
  // reconnect event we already acked) is never double-applied. In-memory
  // only: it resets on reload, which leaves a narrow, accepted gap where
  // an action taken right before the app closes -- before its ack reaches
  // the relay -- could be re-applied once on reconnect. Given the low
  // stakes (a personal pet, not a ledger) and how rare that timing window
  // is, that's judged not worth the complexity of persisting/pruning this.
  const appliedEventIds = useRef(new Set<string>())

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

  // Generates the id a synced action is tracked/broadcast under, marks it
  // applied (so a later echo of it back from the relay is a no-op), and
  // notifies the caller so it can hand the event off to the relay.
  const emitLocalEvent = useCallback(
    (type: CareEventType) => {
      const id = crypto.randomUUID()
      appliedEventIds.current.add(id)
      onCareEvent?.(id, type)
    },
    [onCareEvent],
  )

  const feed = useCallback(() => {
    if (!saveRef.current || saveRef.current.sleeping) return
    setSave((current) => (current ? applyCareEvent(current, 'feed') : current))
    emitLocalEvent('feed')
  }, [emitLocalEvent])

  const playGame = useCallback(() => {
    if (!saveRef.current || saveRef.current.sleeping) return
    setSave((current) => (current ? applyCareEvent(current, 'play') : current))
    emitLocalEvent('play')
  }, [emitLocalEvent])

  const clean = useCallback(() => {
    if (!saveRef.current || saveRef.current.sleeping) return
    setSave((current) => (current ? applyCareEvent(current, 'clean') : current))
    emitLocalEvent('clean')
  }, [emitLocalEvent])

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
    setSave((c) => (c ? applyCareEvent(c, 'pet') : c))
    emitLocalEvent('pet')
    return true
  }, [emitLocalEvent])

  // Applies a care event that originated on another device. Deliberately
  // skips the `sleeping` gate local actions have -- sleeping is a
  // per-device UI toggle, not synced state, so it shouldn't block a
  // remote party's actions from landing here.
  const applyRemoteEvent = useCallback((id: string, type: CareEventType) => {
    if (appliedEventIds.current.has(id)) return false
    appliedEventIds.current.add(id)
    setSave((current) => (current ? applyCareEvent(current, type) : current))
    return true
  }, [])

  const receiveMessage = useCallback(() => {
    setSave((current) =>
      current ? { ...current, stats: { ...current.stats, happiness: clamp(current.stats.happiness + 5) } } : current,
    )
  }, [])

  const mood = save ? deriveMood(save.stats, save.sleeping) : 'content'

  return { save, mood, createPet, feed, playGame, clean, toggleSleep, pet, receiveMessage, applyRemoteEvent }
}
