import { useCallback, useEffect, useRef, useState } from 'react'
import { applyXp, maxHpForLevel, skillsForLevel, xpToNext } from '../data/progression'
import { ZONES, zoneById, type Zone } from '../data/zones'

const QUEST_KEY = 'catmagochi-quest-v1'

export interface QuestSave {
  level: number
  xp: number
  // zoneId -> encounters won there
  zoneClears: Record<string, number>
  // 'YYYY-MM-DD', local. Gates the once-a-day play care event.
  lastPlayDay: string | null
}

// A new day is the local calendar date, not a 24-hour timer -- a timer drifts
// later every day and eventually lands in the middle of the night.
export function todayKey(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function freshSave(): QuestSave {
  return { level: 1, xp: 0, zoneClears: {}, lastPlayDay: null }
}

// Valid JSON is not a valid save. Same shape-then-clamp approach
// usePet.loadSave() uses: anything unusable starts over rather than
// propagating a NaN level into the UI.
function loadQuest(): QuestSave {
  let raw: string | null
  try {
    raw = localStorage.getItem(QUEST_KEY)
  } catch {
    return freshSave() // storage blocked entirely (private mode)
  }
  if (!raw) return freshSave()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return freshSave()
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return freshSave()

  const { level, xp, zoneClears, lastPlayDay } = parsed as Partial<QuestSave>
  const clears: Record<string, number> = {}
  if (zoneClears && typeof zoneClears === 'object' && !Array.isArray(zoneClears)) {
    for (const [id, count] of Object.entries(zoneClears)) {
      // Filtered through the zone list, so a retired zone can't keep state
      // nothing can reach.
      if (!zoneById(id)) continue
      if (typeof count === 'number' && Number.isFinite(count)) clears[id] = Math.max(0, Math.floor(count))
    }
  }

  return {
    level: typeof level === 'number' && Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1,
    xp: typeof xp === 'number' && Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0,
    zoneClears: clears,
    lastPlayDay: typeof lastPlayDay === 'string' ? lastPlayDay : null,
  }
}

// Level, xp and zone progress. Its own key, not PetSave: PetSave syncs between
// devices as a care-event log, and a single-player campaign has no merge story.
export function useQuest() {
  const [save, setSave] = useState<QuestSave>(loadQuest)
  // Updated in the render body, same pattern usePet uses for saveRef, so
  // recordWin can return a value without doing work inside a setState updater.
  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    try {
      localStorage.setItem(QUEST_KEY, JSON.stringify(save))
    } catch {
      // Quota exceeded or storage blocked -- the run still works for this
      // session; losing the persisted copy costs progress, not a crash.
    }
  }, [save])

  const recordWin = useCallback((zoneId: string, xpGained: number) => {
    const current = saveRef.current
    const day = todayKey()
    const firstWinToday = current.lastPlayDay !== day
    const { level, xp, levelsGained } = applyXp(current.level, current.xp, xpGained)
    setSave({
      level,
      xp,
      zoneClears: { ...current.zoneClears, [zoneId]: (current.zoneClears[zoneId] ?? 0) + 1 },
      lastPlayDay: day,
    })
    return { levelsGained, firstWinToday }
  }, [])

  // Losing costs only the fight -- no xp, no progress, nothing taken away.
  const recordLoss = useCallback(() => {}, [])

  const clearsFor = useCallback((zoneId: string) => save.zoneClears[zoneId] ?? 0, [save.zoneClears])

  const unlockedZones: Zone[] = ZONES.filter((z) => z.unlockLevel <= save.level)

  return {
    level: save.level,
    xp: save.xp,
    xpNeeded: xpToNext(save.level),
    maxHp: maxHpForLevel(save.level),
    skills: skillsForLevel(save.level),
    clearsFor,
    unlockedZones,
    recordWin,
    recordLoss,
  }
}
