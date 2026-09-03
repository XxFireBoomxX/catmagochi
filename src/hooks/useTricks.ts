import { useCallback, useEffect, useRef, useState } from 'react'
import { nextTrickId, TRICKS, TRICK_POINTS, trickById, type Trick } from '../data/tricks'
import { OUTCOME_POINTS, type Outcome } from '../data/lessons'

const TRICKS_KEY = 'catmagochi-tricks-v1'

export interface TrickSave {
  // Always recomputed from `learned` on load rather than trusted -- see loadTricks.
  currentTrickId: string | null
  progress: number
  learned: string[]
  // 'YYYY-MM-DD', local calendar day. Null until the first lesson.
  lastLessonDay: string | null
}

// A new day is the local calendar date, not a 24-hour timer. A timer would
// drift later every day and eventually put the daily ritual in the middle of
// the night.
export function todayKey(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function freshSave(): TrickSave {
  return { currentTrickId: nextTrickId([]), progress: 0, learned: [], lastLessonDay: null }
}

// Same shape-before-shrug approach usePet.loadSave() uses: valid JSON is not
// the same as a valid save, and anything unusable starts over rather than
// propagating undefined into the UI.
function loadTricks(): TrickSave {
  let raw: string | null
  try {
    raw = localStorage.getItem(TRICKS_KEY)
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

  const { learned, progress, lastLessonDay } = parsed as Partial<TrickSave>
  // Filtered through the curriculum, so a trick that was renamed or removed
  // can't leave the state pointing at an id nothing resolves.
  const learnedIds = Array.isArray(learned)
    ? learned.filter((id): id is string => typeof id === 'string' && Boolean(trickById(id)))
    : []
  const currentTrickId = nextTrickId(learnedIds)

  return {
    learned: learnedIds,
    currentTrickId,
    // Progress belongs to the current trick; with nothing left to learn it
    // has nowhere to apply.
    progress: currentTrickId && typeof progress === 'number' && Number.isFinite(progress) ? Math.max(0, progress) : 0,
    lastLessonDay: typeof lastLessonDay === 'string' ? lastLessonDay : null,
  }
}

// Trick progress deliberately lives outside PetSave. PetSave syncs between
// devices as a care-event log; teaching is a single-player ritual, and putting
// it in the synced save would mean designing a merge strategy for something
// that never needs one.
export function useTricks() {
  const [save, setSave] = useState<TrickSave>(loadTricks)
  // Updated during the render body, same pattern as usePet's saveRef, so
  // recordLesson can read current state without a stale closure and without
  // doing work inside a setState updater (which must stay pure).
  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    try {
      localStorage.setItem(TRICKS_KEY, JSON.stringify(save))
    } catch {
      // Quota exceeded or storage blocked. Progress still works for this
      // session; losing the persisted copy costs a day, not a crash.
    }
  }, [save])

  const currentTrick = save.currentTrickId ? trickById(save.currentTrickId) ?? null : null
  const learnedTricks = save.learned
    .map((id) => trickById(id))
    .filter((t): t is Trick => Boolean(t))

  const lessonAvailable = currentTrick !== null && save.lastLessonDay !== todayKey()

  // Applies one lesson's outcome and spends the day. Returns the trick that
  // was just completed, or null -- the panel uses it to decide whether to
  // celebrate.
  const recordLesson = useCallback((outcome: Outcome): Trick | null => {
    const current = saveRef.current
    const day = todayKey()
    const trick = current.currentTrickId ? trickById(current.currentTrickId) ?? null : null
    if (!trick) {
      setSave({ ...current, lastLessonDay: day })
      return null
    }

    const progress = current.progress + OUTCOME_POINTS[outcome]
    if (progress >= TRICK_POINTS) {
      const learned = [...current.learned, trick.id]
      // Surplus points are dropped rather than carried over: every trick
      // should take its own full run of lessons.
      setSave({ currentTrickId: nextTrickId(learned), progress: 0, learned, lastLessonDay: day })
      return trick
    }

    setSave({ ...current, progress, lastLessonDay: day })
    return null
  }, [])

  return {
    lessonAvailable,
    currentTrick,
    progress: save.progress,
    learnedTricks,
    totalTricks: TRICKS.length,
    recordLesson,
  }
}
