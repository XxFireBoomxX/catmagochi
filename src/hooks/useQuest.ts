import { useCallback, useEffect, useRef, useState } from 'react'
import { applyXp, damageBonusForLevel, maxHpForLevel, skillsForLevel, xpToNext } from '../data/progression'
import { ZONES, zoneById, type Zone } from '../data/zones'
import { ITEM_CAP, itemById } from '../data/items'

const QUEST_KEY = 'catmagochi-quest-v1'

export interface QuestSave {
  level: number
  xp: number
  // zoneId -> encounters won there
  zoneClears: Record<string, number>
  // 'YYYY-MM-DD', local. Gates the once-a-day play care event.
  lastPlayDay: string | null
  // itemId -> count carried, capped at ITEM_CAP.
  bag: Record<string, number>
  // The trinket currently worn, if any.
  worn: string | null
}

// A new day is the local calendar date, not a 24-hour timer -- a timer drifts
// later every day and eventually lands in the middle of the night.
export function todayKey(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function freshSave(): QuestSave {
  return { level: 1, xp: 0, zoneClears: {}, lastPlayDay: null, bag: {}, worn: null }
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

  const { level, xp, zoneClears, lastPlayDay, bag, worn } = parsed as Partial<QuestSave>
  const clears: Record<string, number> = {}
  if (zoneClears && typeof zoneClears === 'object' && !Array.isArray(zoneClears)) {
    for (const [id, count] of Object.entries(zoneClears)) {
      // Filtered through the zone list, so a retired zone can't keep state
      // nothing can reach.
      if (!zoneById(id)) continue
      if (typeof count === 'number' && Number.isFinite(count)) clears[id] = Math.max(0, Math.floor(count))
    }
  }

  // Unknown ids dropped, counts clamped into 1..ITEM_CAP -- a hand-edited or
  // older bag can't put an item in the move list that no longer exists.
  const carried: Record<string, number> = {}
  if (bag && typeof bag === 'object' && !Array.isArray(bag)) {
    for (const [id, count] of Object.entries(bag)) {
      if (!itemById(id)) continue
      if (typeof count !== 'number' || !Number.isFinite(count) || count < 1) continue
      carried[id] = Math.min(ITEM_CAP, Math.floor(count))
    }
  }
  const wornItem = typeof worn === 'string' ? itemById(worn) : undefined

  return {
    bag: carried,
    // Only an actual trinket can be worn; anything else becomes nothing.
    worn: wornItem?.kind === 'trinket' ? wornItem.id : null,
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

  // Every mutation below applies through a functional updater rather than
  // spreading saveRef.current. Ending a fight calls consume, addLoot and
  // recordWin back to back in one handler; saveRef only refreshes on render,
  // so spreading it three times meant all three built on the same stale save
  // and the last one silently threw away the other two.
  const recordWin = useCallback((zoneId: string, xpGained: number) => {
    // Safe to read from the ref for the *return* value: nothing else in the
    // fight-end sequence touches level, xp or lastPlayDay.
    const current = saveRef.current
    const day = todayKey()
    const firstWinToday = current.lastPlayDay !== day
    const { levelsGained } = applyXp(current.level, current.xp, xpGained)
    setSave((prev) => {
      const next = applyXp(prev.level, prev.xp, xpGained)
      return {
        ...prev,
        level: next.level,
        xp: next.xp,
        zoneClears: { ...prev.zoneClears, [zoneId]: (prev.zoneClears[zoneId] ?? 0) + 1 },
        lastPlayDay: day,
      }
    })
    return { levelsGained, firstWinToday }
  }, [])

  // Losing costs only the fight -- no xp, no progress, nothing taken away.
  const recordLoss = useCallback(() => {}, [])

  const clearsFor = useCallback((zoneId: string) => save.zoneClears[zoneId] ?? 0, [save.zoneClears])

  // A null drop is the common case -- most fights yield nothing -- so it is
  // accepted here rather than making every caller check first.
  const addLoot = useCallback((itemId: string | null) => {
    if (!itemId || !itemById(itemId)) return
    setSave((prev) => {
      const held = prev.bag[itemId] ?? 0
      if (held >= ITEM_CAP) return prev
      return { ...prev, bag: { ...prev.bag, [itemId]: held + 1 } }
    })
  }, [])

  // Called once when a fight ends, with everything CombatState recorded as
  // used -- not at the moment of use, so quitting mid-fight cannot duplicate.
  const consume = useCallback((itemIds: string[]) => {
    if (itemIds.length === 0) return
    setSave((prev) => {
      const bag = { ...prev.bag }
      for (const id of itemIds) {
        const held = bag[id] ?? 0
        if (held <= 1) delete bag[id]
        else bag[id] = held - 1
      }
      return { ...prev, bag }
    })
  }, [])

  const wear = useCallback((itemId: string | null) => {
    if (itemId === null) {
      setSave((prev) => ({ ...prev, worn: null }))
      return
    }
    // Consumables are used, not worn.
    if (itemById(itemId)?.kind !== 'trinket') return
    setSave((prev) => ({ ...prev, worn: itemId }))
  }, [])

  const unlockedZones: Zone[] = ZONES.filter((z) => z.unlockLevel <= save.level)
  // The whole ladder, so the panel can show what is still ahead. A level
  // number is only worth caring about if you can see what it buys.
  const zones = ZONES.map((zone) => ({ zone, unlocked: zone.unlockLevel <= save.level }))

  return {
    level: save.level,
    xp: save.xp,
    xpNeeded: xpToNext(save.level),
    maxHp: maxHpForLevel(save.level),
    damageBonus: damageBonusForLevel(save.level),
    skills: skillsForLevel(save.level),
    clearsFor,
    unlockedZones,
    zones,
    bag: save.bag,
    worn: save.worn,
    addLoot,
    consume,
    wear,
    recordWin,
    recordLoss,
  }
}
