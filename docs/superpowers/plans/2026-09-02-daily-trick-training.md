# Daily Trick Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `[PLAY]`'s relay-dependent nudge picker with an offline daily trick-teaching ritual.

**Architecture:** Two pure data modules (curriculum, lesson prose + odds), one persistence hook, one panel component swapped into the slot `NudgePicker` occupies. The lesson still fires the existing `play` care event, so stat and sync behaviour is unchanged.

**Tech Stack:** React 19 + TypeScript, Vitest + Testing Library, localStorage. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-02-daily-trick-training-design.md`

## Global Constraints

- Plain ASCII only in all UI text and effects — no emoji (`CLAUDE.md`, "Visual theme").
- UI copy in English, matching the rest of the app.
- Bracket-style button labels (`[ CANCEL ]`) except lesson approach options, which stay sentence-case like `NUDGE_OPTIONS` did — they read as things you do, not system commands.
- Coverage thresholds are enforced at 90% lines/statements/branches/functions (`vite.config.ts`).
- New persisted state uses its own localStorage key, never `PetSave`.
- Randomness enters pure functions as a parameter, never via `Math.random()` inside them.

---

### Task 1: Trick curriculum

**Files:**
- Create: `src/data/tricks.ts`
- Test: `src/data/tricks.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface Trick { id: string; name: string; success: string[]; refusal: string[] }`, `TRICKS: Trick[]`, `TRICK_POINTS = 8`, `trickById(id: string): Trick | undefined`, `nextTrickId(learned: string[]): string | null`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { nextTrickId, TRICKS, trickById, TRICK_POINTS } from './tricks'

describe('tricks', () => {
  it('has a stable, unique id for every trick', () => {
    const ids = TRICKS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every trick lines for both performing and refusing', () => {
    for (const trick of TRICKS) {
      expect(trick.success.length).toBeGreaterThan(0)
      expect(trick.refusal.length).toBeGreaterThan(0)
    }
  })

  it('costs a whole number of lessons to learn', () => {
    expect(TRICK_POINTS).toBeGreaterThan(0)
  })

  it('finds a trick by id', () => {
    expect(trickById(TRICKS[0].id)).toBe(TRICKS[0])
    expect(trickById('not-a-trick')).toBeUndefined()
  })

  it('teaches the first unlearned trick, in curriculum order', () => {
    expect(nextTrickId([])).toBe(TRICKS[0].id)
    expect(nextTrickId([TRICKS[0].id])).toBe(TRICKS[1].id)
  })

  it('skips already-learned tricks wherever they appear', () => {
    expect(nextTrickId([TRICKS[1].id])).toBe(TRICKS[0].id)
  })

  it('reports nothing left once every trick is learned', () => {
    expect(nextTrickId(TRICKS.map((t) => t.id))).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/tricks.test.ts`
Expected: FAIL — module `./tricks` does not exist.

- [ ] **Step 3: Write minimal implementation**

`src/data/tricks.ts` — ten tricks in teaching order, easiest first. Cat-appropriate: the later ones are funny precisely because cats do not do them.

```ts
export interface Trick {
  id: string
  name: string
  success: string[]
  refusal: string[]
}

export const TRICK_POINTS = 8

export const TRICKS: Trick[] = [
  { id: 'sit', name: 'sit', success: [...], refusal: [...] },
  // shake-paw, high-five, spin, lie-down, roll-over, play-dead,
  // fetch, come-when-called, jump-through-hoop
]

export function trickById(id: string): Trick | undefined {
  return TRICKS.find((t) => t.id === id)
}

export function nextTrickId(learned: string[]): string | null {
  return TRICKS.find((t) => !learned.includes(t.id))?.id ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/tricks.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/tricks.ts src/data/tricks.test.ts
git commit -m "Add the trick curriculum"
```

---

### Task 2: Lesson moods, odds and prose

**Files:**
- Create: `src/data/lessons.ts`
- Test: `src/data/lessons.test.ts`

**Interfaces:**
- Consumes: `Trick` from Task 1 (for name interpolation).
- Produces: `LessonMood`, `Approach`, `Outcome`, `Weighting`, `APPROACHES: { id: Approach; label: string }[]`, `LESSON_MOOD_LABEL: Record<LessonMood, string>`, `MOOD_INTRO: Record<LessonMood, string[]>`, `APPROACH_OUTCOME: Record<Approach, Record<Outcome, string[]>>`, `ODDS: Record<LessonMood, Record<Approach, Weighting>>`, `OUTCOME_WEIGHTS: Record<Weighting, Record<Outcome, number>>`, `OUTCOME_POINTS: Record<Outcome, number>`, `lessonMoodForDay(dayKey: string): LessonMood`, `rollOutcome(mood: LessonMood, approach: Approach, roll: number): Outcome`.

`rollOutcome` takes `roll` (a number in `[0, 1)`) rather than calling `Math.random()`, so the odds table is testable without stubbing globals. Outcome order for the cumulative walk is fixed: `learned`, `almost`, `nothing`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import {
  APPROACHES, lessonMoodForDay, LESSON_MOOD_LABEL, MOOD_INTRO,
  APPROACH_OUTCOME, ODDS, OUTCOME_POINTS, OUTCOME_WEIGHTS, rollOutcome,
  type Approach, type LessonMood,
} from './lessons'

const MOODS = Object.keys(ODDS) as LessonMood[]

describe('lesson odds', () => {
  it('rates every approach for every mood', () => {
    for (const mood of MOODS) {
      for (const { id } of APPROACHES) expect(ODDS[mood][id]).toBeDefined()
    }
  })

  it('gives each mood exactly one best, one ok and one poor approach', () => {
    for (const mood of MOODS) {
      const ratings = APPROACHES.map(({ id }) => ODDS[mood][id]).sort()
      expect(ratings).toEqual(['best', 'ok', 'poor'])
    }
  })

  // No approach may be globally correct, or the choice stops mattering.
  it('makes each approach the best one for exactly two moods', () => {
    for (const { id } of APPROACHES) {
      const bestFor = MOODS.filter((m) => ODDS[m][id] === 'best')
      expect(bestFor).toHaveLength(2)
    }
  })

  it('has weights that sum to 1 for every rating', () => {
    for (const weights of Object.values(OUTCOME_WEIGHTS)) {
      const total = Object.values(weights).reduce((a, b) => a + b, 0)
      expect(total).toBeCloseTo(1)
    }
  })

  it('always leaves some chance of both success and failure', () => {
    for (const weights of Object.values(OUTCOME_WEIGHTS)) {
      expect(weights.learned).toBeGreaterThan(0)
      expect(weights.nothing).toBeGreaterThan(0)
    }
  })
})

describe('rollOutcome', () => {
  it('returns the first outcome for a roll at the very bottom', () => {
    expect(rollOutcome('restless', 'play', 0)).toBe('learned')
  })

  it('returns the last outcome for a roll at the very top', () => {
    expect(rollOutcome('restless', 'play', 0.999)).toBe('nothing')
  })

  it('is more likely to succeed with the best approach than the poor one', () => {
    const roll = 0.4
    expect(rollOutcome('restless', 'play', roll)).toBe('learned') // best
    expect(rollOutcome('restless', 'patience', roll)).not.toBe('learned') // poor
  })

  it('scores a learned outcome higher than an almost, and nothing at zero', () => {
    expect(OUTCOME_POINTS.learned).toBeGreaterThan(OUTCOME_POINTS.almost)
    expect(OUTCOME_POINTS.almost).toBeGreaterThan(OUTCOME_POINTS.nothing)
    expect(OUTCOME_POINTS.nothing).toBe(0)
  })
})

describe('lessonMoodForDay', () => {
  it('is stable for the same day', () => {
    expect(lessonMoodForDay('2026-09-02')).toBe(lessonMoodForDay('2026-09-02'))
  })

  it('varies across a week rather than sticking on one mood', () => {
    const week = ['2026-09-02','2026-09-03','2026-09-04','2026-09-05','2026-09-06','2026-09-07','2026-09-08']
    expect(new Set(week.map(lessonMoodForDay)).size).toBeGreaterThan(1)
  })

  it('only ever returns a mood the odds table knows', () => {
    for (let d = 1; d <= 28; d++) {
      const key = `2026-09-${String(d).padStart(2, '0')}`
      expect(MOODS).toContain(lessonMoodForDay(key))
    }
  })
})

describe('lesson prose', () => {
  it('has an intro line for every mood and a label to match', () => {
    for (const mood of MOODS) {
      expect(MOOD_INTRO[mood].length).toBeGreaterThan(0)
      expect(LESSON_MOOD_LABEL[mood]).toBeTruthy()
    }
  })

  it('has lines for every approach and outcome', () => {
    for (const { id } of APPROACHES) {
      for (const outcome of ['learned', 'almost', 'nothing'] as const) {
        expect(APPROACH_OUTCOME[id][outcome].length).toBeGreaterThan(0)
      }
    }
  })

  it('keeps every line plain ASCII, per the app theme', () => {
    const lines = [
      ...Object.values(MOOD_INTRO).flat(),
      ...APPROACHES.flatMap(({ id }) => Object.values(APPROACH_OUTCOME[id]).flat()),
    ]
    for (const line of lines) expect(line).toMatch(/^[\x20-\x7E]*$/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/lessons.test.ts` — Expected: FAIL, module missing.

- [ ] **Step 3: Write minimal implementation**

Odds table exactly as the spec's table. `lessonMoodForDay` hashes the day key so it is stable and spreads across moods:

```ts
export function lessonMoodForDay(dayKey: string): LessonMood {
  let hash = 0
  for (let i = 0; i < dayKey.length; i++) hash = (hash * 31 + dayKey.charCodeAt(i)) % 100_000
  return LESSON_MOODS[hash % LESSON_MOODS.length]
}

export function rollOutcome(mood: LessonMood, approach: Approach, roll: number): Outcome {
  const weights = OUTCOME_WEIGHTS[ODDS[mood][approach]]
  let cumulative = 0
  for (const outcome of OUTCOME_ORDER) {
    cumulative += weights[outcome]
    if (roll < cumulative) return outcome
  }
  return 'nothing'
}
```

`{trick}` is the interpolation token in `APPROACH_OUTCOME` lines; the panel substitutes the current trick's name.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/lessons.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/lessons.ts src/data/lessons.test.ts
git commit -m "Add lesson moods, the odds table and lesson prose"
```

---

### Task 3: Trick progress hook

**Files:**
- Create: `src/hooks/useTricks.ts`
- Test: `src/hooks/useTricks.test.ts`

**Interfaces:**
- Consumes: `TRICKS`, `TRICK_POINTS`, `nextTrickId`, `trickById` (Task 1); `Outcome`, `OUTCOME_POINTS` (Task 2).
- Produces: `TrickSave`, `todayKey(now?: Date): string`, `useTricks()` returning `{ lessonAvailable: boolean; currentTrick: Trick | null; progress: number; learnedTricks: Trick[]; recordLesson(outcome: Outcome): Trick | null }`.

`recordLesson` returns the `Trick` that was just completed, or `null` — the panel uses it to decide whether to celebrate. Storage key: `catmagochi-tricks-v1`.

- [ ] **Step 1: Write the failing test**

```ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { todayKey, useTricks } from './useTricks'
import { TRICKS, TRICK_POINTS } from '../data/tricks'

const KEY = 'catmagochi-tricks-v1'
const NOW = new Date('2026-09-02T09:00:00')

describe('todayKey', () => {
  it('formats the local calendar day', () => {
    expect(todayKey(new Date('2026-09-02T23:30:00'))).toBe('2026-09-02')
  })
})

describe('useTricks', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('starts on the first trick with a lesson available', () => {
    const { result } = renderHook(() => useTricks())
    expect(result.current.currentTrick?.id).toBe(TRICKS[0].id)
    expect(result.current.lessonAvailable).toBe(true)
    expect(result.current.progress).toBe(0)
  })

  it('spends the day’s lesson and adds points', () => {
    const { result } = renderHook(() => useTricks())
    act(() => { result.current.recordLesson('almost') })
    expect(result.current.progress).toBe(1)
    expect(result.current.lessonAvailable).toBe(false)
  })

  it('offers a lesson again the next day', () => {
    const { result } = renderHook(() => useTricks())
    act(() => { result.current.recordLesson('almost') })
    act(() => { vi.setSystemTime(new Date('2026-09-03T09:00:00')) })
    const { result: next } = renderHook(() => useTricks())
    expect(next.current.lessonAvailable).toBe(true)
    expect(next.current.progress).toBe(1)
  })

  it('learns the trick once the points are earned and moves to the next', () => {
    localStorage.setItem(KEY, JSON.stringify({
      currentTrickId: TRICKS[0].id, progress: TRICK_POINTS - 1, learned: [], lastLessonDay: null,
    }))
    const { result } = renderHook(() => useTricks())
    let learned: unknown
    act(() => { learned = result.current.recordLesson('almost') })
    expect((learned as { id: string }).id).toBe(TRICKS[0].id)
    expect(result.current.learnedTricks.map((t) => t.id)).toEqual([TRICKS[0].id])
    expect(result.current.currentTrick?.id).toBe(TRICKS[1].id)
    expect(result.current.progress).toBe(0)
  })

  it('reports no current trick once every one is learned', () => {
    localStorage.setItem(KEY, JSON.stringify({
      currentTrickId: null, progress: 0, learned: TRICKS.map((t) => t.id), lastLessonDay: null,
    }))
    const { result } = renderHook(() => useTricks())
    expect(result.current.currentTrick).toBeNull()
    expect(result.current.lessonAvailable).toBe(false)
  })

  it('does not overshoot into the next trick when one lesson would overflow', () => {
    localStorage.setItem(KEY, JSON.stringify({
      currentTrickId: TRICKS[0].id, progress: TRICK_POINTS - 1, learned: [], lastLessonDay: null,
    }))
    const { result } = renderHook(() => useTricks())
    act(() => { result.current.recordLesson('learned') }) // +2 against 1 remaining
    expect(result.current.progress).toBe(0)
  })

  it('ignores a structurally invalid save and starts fresh', () => {
    localStorage.setItem(KEY, 'null')
    const { result } = renderHook(() => useTricks())
    expect(result.current.currentTrick?.id).toBe(TRICKS[0].id)
  })

  it('drops a learned id that no longer exists in the curriculum', () => {
    localStorage.setItem(KEY, JSON.stringify({
      currentTrickId: null, progress: 0, learned: ['retired-trick'], lastLessonDay: null,
    }))
    const { result } = renderHook(() => useTricks())
    expect(result.current.learnedTricks).toEqual([])
    expect(result.current.currentTrick?.id).toBe(TRICKS[0].id)
  })

  it('keeps working when localStorage cannot be written', () => {
    const { result } = renderHook(() => useTricks())
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(() => { act(() => { result.current.recordLesson('almost') }) }).not.toThrow()
    expect(result.current.progress).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useTricks.test.ts` — Expected: FAIL, module missing.

- [ ] **Step 3: Write minimal implementation**

Follows `usePet.loadSave()`: parse, validate shape, merge defaults. Learned ids are filtered through `trickById` so a removed trick cannot wedge the state. `currentTrickId` is always recomputed from `learned` on load rather than trusted.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useTricks.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTricks.ts src/hooks/useTricks.test.ts
git commit -m "Add the trick progress hook"
```

---

### Task 4: The panel

**Files:**
- Create: `src/components/TrickPanel.tsx`, `src/components/TrickPanel.css`, `src/components/TrickPanel.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: `TrickPanel({ onLessonDone, onPerform, onClose }: { onLessonDone: () => void; onPerform: () => void; onClose: () => void })`.

Reuses `.ascii-screen` from `AsciiCat.css`, exactly as `NudgePicker` did. Three views driven by local state: `lesson` (mood + three approaches), `result` (outcome line, progress bar, celebration if the trick was learned), `showoff` (learned tricks + "next lesson: tomorrow"). Opens on `lesson` when one is available, otherwise `showoff`.

`onLessonDone` fires once per lesson, after the approach is picked. `onPerform` fires each time a learned trick is asked for.

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TrickPanel } from './TrickPanel'
import { TRICKS, TRICK_POINTS } from '../data/tricks'

const KEY = 'catmagochi-tricks-v1'

function setup(over: Partial<Parameters<typeof TrickPanel>[0]> = {}) {
  const props = { onLessonDone: vi.fn(), onPerform: vi.fn(), onClose: vi.fn(), ...over }
  render(<TrickPanel {...props} />)
  return props
}

describe('TrickPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-02T09:00:00'))
    vi.spyOn(Math, 'random').mockReturnValue(0) // best outcome, first line
  })
  afterEach(() => vi.useRealTimers())

  it('opens on today’s lesson, naming the trick and offering three approaches', () => {
    setup()
    expect(screen.getByText(new RegExp(TRICKS[0].name, 'i'))).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /offer a treat|wait quietly|wave the string/i })).toHaveLength(3)
  })

  it('reports the lesson once an approach is picked', () => {
    const { onLessonDone } = setup()
    fireEvent.click(screen.getByRole('button', { name: /wait quietly/i }))
    expect(onLessonDone).toHaveBeenCalledTimes(1)
  })

  it('shows the progress bar after the lesson', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /wait quietly/i }))
    expect(screen.getByRole('progressbar', { name: /learning/i })).toBeInTheDocument()
  })

  it('cannot take a second lesson the same day', () => {
    const { onLessonDone } = setup()
    fireEvent.click(screen.getByRole('button', { name: /wait quietly/i }))
    fireEvent.click(screen.getByRole('button', { name: /done|continue/i }))
    expect(screen.getByText(/tomorrow/i)).toBeInTheDocument()
    expect(onLessonDone).toHaveBeenCalledTimes(1)
  })

  it('celebrates when the trick is finally learned', () => {
    localStorage.setItem(KEY, JSON.stringify({
      currentTrickId: TRICKS[0].id, progress: TRICK_POINTS - 1, learned: [], lastLessonDay: null,
    }))
    setup()
    fireEvent.click(screen.getByRole('button', { name: /wait quietly/i }))
    expect(screen.getByText(/learned/i)).toBeInTheDocument()
  })

  it('lets a learned trick be performed, and reports it', () => {
    localStorage.setItem(KEY, JSON.stringify({
      currentTrickId: TRICKS[1].id, progress: 0, learned: [TRICKS[0].id], lastLessonDay: '2026-09-02',
    }))
    const { onPerform } = setup()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(TRICKS[0].name, 'i') }))
    expect(onPerform).toHaveBeenCalledTimes(1)
  })

  it('says so plainly when nothing is learned yet and the lesson is spent', () => {
    localStorage.setItem(KEY, JSON.stringify({
      currentTrickId: TRICKS[0].id, progress: 1, learned: [], lastLessonDay: '2026-09-02',
    }))
    setup()
    expect(screen.getByText(/tomorrow/i)).toBeInTheDocument()
  })

  it('closes on cancel', () => {
    const { onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: /back|cancel/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/TrickPanel.test.tsx` — Expected: FAIL, module missing.

- [ ] **Step 3: Write minimal implementation**

Progress bar reuses `StatBar` with `code="LEARN"` and `label` naming the trick, so `getByRole('progressbar')` works and the visual language matches the growth bar.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/TrickPanel.test.tsx` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/TrickPanel.tsx src/components/TrickPanel.css src/components/TrickPanel.test.tsx
git commit -m "Add the trick training panel"
```

---

### Task 5: Wire into App, remove the nudge picker

**Files:**
- Modify: `src/App.tsx`, `src/App.test.tsx`
- Delete: `src/components/NudgePicker.tsx`, `src/components/NudgePicker.css`, `src/components/NudgePicker.test.tsx`, `src/data/nudges.ts`

**Interfaces:**
- Consumes: `TrickPanel` (Task 4).
- Produces: no new exports. `handleSendNudge` is replaced by `handleLessonDone` (fires `playGame()`, `pulseFor('play')`, `triggerCue('play')`) and `handlePerformTrick` (fires `triggerCue('play')` only — performances change no stats).

`useMessages().send` keeps its export and tests but loses its caller. `sendStatusCaption`, `showSendStatus`, `SEND_STATUS_MS` and `sendStatusTimer` go with the nudge: nothing is sent any more, so there is no send status to report.

- [ ] **Step 1: Write the failing test**

```tsx
it('opens the trick panel from PLAY', () => {
  seedSave()
  renderApp()
  fireEvent.click(screen.getByText('[PLAY]'))
  expect(screen.getByText(/lesson|teaching/i)).toBeInTheDocument()
})

it('a lesson emits exactly one play care event', () => {
  seedSave()
  renderApp()
  fireEvent.click(screen.getByText('[PLAY]'))
  fireEvent.click(screen.getByRole('button', { name: /wait quietly/i }))
  expect(mockEmit).toHaveBeenCalledTimes(1)
  expect(mockEmit.mock.calls[0][1]).toBe('play')
})

it('performing a trick changes no stats', () => {
  seedSave({ /* a learned trick seeded via localStorage in the test body */ })
  renderApp()
  const before = getSave().stats
  fireEvent.click(screen.getByText('[PLAY]'))
  fireEvent.click(screen.getByRole('button', { name: new RegExp(TRICKS[0].name, 'i') }))
  expect(getSave().stats).toEqual(before)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/App.test.tsx` — Expected: FAIL, `[PLAY]` still opens the nudge picker.

- [ ] **Step 3: Write minimal implementation**

Swap the component, delete the nudge files and the send-status state, drop the now-unused `NUDGE_OPTIONS` import.

- [ ] **Step 4: Run the whole suite**

Run: `npm test` — Expected: PASS. Existing nudge tests in `App.test.tsx` are deleted, not adapted; the behaviour they covered no longer exists.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Replace the nudge picker with daily trick training"
```

---

### Task 6: Learned tricks in the ambient flavour loop

**Files:**
- Modify: `src/hooks/useFlavorText.ts`, `src/hooks/useFlavorText.test.ts`, `src/App.tsx`

**Interfaces:**
- Consumes: `learnedTricks` (Task 3).
- Produces: `useFlavorText(mood: Mood, extraLines?: string[]): string` — the optional pool is concatenated onto the mood's own pool, so a learned trick can surface unprompted.

- [ ] **Step 1: Write the failing test**

```ts
it('can draw an idle line from the extra pool it is given', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.99) // last entry, and above FLAVOR_CHANCE inverse
  const { result } = renderHook(() => useFlavorText('happy', ['practices her high five']))
  act(() => { vi.advanceTimersByTime(IDLE_CHECK_MIN_MS + IDLE_CHECK_JITTER_MS) })
  expect(result.current).toBe('practices her high five')
})

it('behaves exactly as before when given no extra pool', () => { /* existing assertions */ })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useFlavorText.test.ts` — Expected: FAIL, the hook takes one argument.

- [ ] **Step 3: Write minimal implementation**

Append `extraLines` to the chosen pool. `App.tsx` builds the pool from `useTricks().learnedTricks`, memoised so the effect does not restart on every render.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useFlavorText.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Let learned tricks surface in the idle flavour loop"
```

---

### Task 7: Documentation

**Files:**
- Modify: `CLAUDE.md`, `IDEAS.md`, `README.md`

- [ ] **Step 1: Rewrite `CLAUDE.md`'s "Play (a nudge, not a mini-game)" section**

It documents a feature that no longer exists. Replace with "Play (a daily trick lesson)": the daily gate, the odds table and why the choice shifts odds rather than deciding, why performing changes no stats, and why trick progress is not in `PetSave`. Keep the historical reasoning for why the mini-game and the nudge were each rejected — it is the record of how the design got here, and the new section is the third answer to the same question.

- [ ] **Step 2: Update `IDEAS.md`**

Strike through the nudge entry with the outcome, noting the relay never shipped so `[PLAY]` had no destination.

- [ ] **Step 3: Update `README.md`**

The "[PLAY] sends a nudge" bullet describes the removed feature.

- [ ] **Step 4: Full verification**

```bash
npm run lint && npm test && npm run build && npm run test:coverage
cd server && npm test
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Document daily trick training"
```

---

## Self-Review

**Spec coverage:** daily lesson (Tasks 2-4), mood × approach odds (Task 2), outcome prose (Task 2), progress and learning (Tasks 1, 3), performances (Task 4), no dead screen (Task 4), ambient payoff (Task 6), `play` care event (Task 5), `send()` retained (Task 5), state shape and day-key rationale (Task 3), file list (all), testing plan (all). No gaps.

**Placeholders:** the trick and prose arrays are described by shape, count and an example rather than transcribed in full — writing them is the implementation step, and duplicating ~85 lines of prose here would only create two copies to keep in sync. Every interface, signature and test is concrete.

**Type consistency:** `Outcome` is produced by `rollOutcome` (Task 2) and consumed by `recordLesson` (Task 3). `Trick` is produced by Task 1 and returned by `recordLesson` and `currentTrick`. `TRICK_POINTS` is the single source for the bar's maximum. `lessonAvailable` is the only gate the panel reads. Names match across tasks.
