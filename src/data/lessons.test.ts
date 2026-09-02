import { describe, expect, it } from 'vitest'
import {
  APPROACHES,
  APPROACH_OUTCOME,
  LESSON_MOODS,
  LESSON_MOOD_LABEL,
  MOOD_INTRO,
  ODDS,
  OUTCOME_ORDER,
  OUTCOME_POINTS,
  OUTCOME_WEIGHTS,
  lessonMoodForDay,
  rollOutcome,
} from './lessons'

describe('lesson odds', () => {
  it('rates every approach for every mood', () => {
    for (const mood of LESSON_MOODS) {
      for (const { id } of APPROACHES) expect(ODDS[mood][id]).toBeDefined()
    }
  })

  it('gives each mood exactly one best, one ok and one poor approach', () => {
    for (const mood of LESSON_MOODS) {
      const ratings = APPROACHES.map(({ id }) => ODDS[mood][id]).sort()
      expect(ratings).toEqual(['best', 'ok', 'poor'])
    }
  })

  // If one approach were right more often than the others, the daily choice
  // would collapse into always picking it.
  it('makes each approach the best one for exactly two moods', () => {
    for (const { id } of APPROACHES) {
      const bestFor = LESSON_MOODS.filter((m) => ODDS[m][id] === 'best')
      expect(bestFor).toHaveLength(2)
    }
  })

  it('has weights that sum to 1 for every rating', () => {
    for (const weights of Object.values(OUTCOME_WEIGHTS)) {
      const total = OUTCOME_ORDER.reduce((sum, outcome) => sum + weights[outcome], 0)
      expect(total).toBeCloseTo(1)
    }
  })

  // A guaranteed outcome either way would make the cat a machine.
  it('always leaves some chance of both success and failure', () => {
    for (const weights of Object.values(OUTCOME_WEIGHTS)) {
      expect(weights.learned).toBeGreaterThan(0)
      expect(weights.nothing).toBeGreaterThan(0)
    }
  })

  it('rewards the best rating more than the poor one', () => {
    expect(OUTCOME_WEIGHTS.best.learned).toBeGreaterThan(OUTCOME_WEIGHTS.ok.learned)
    expect(OUTCOME_WEIGHTS.ok.learned).toBeGreaterThan(OUTCOME_WEIGHTS.poor.learned)
  })
})

describe('rollOutcome', () => {
  it('returns the first outcome for a roll at the very bottom', () => {
    expect(rollOutcome('restless', 'play', 0)).toBe('learned')
  })

  it('returns the last outcome for a roll at the very top', () => {
    expect(rollOutcome('restless', 'play', 0.999)).toBe('nothing')
  })

  it('is likelier to succeed with the best approach than the poor one', () => {
    const roll = 0.4
    expect(rollOutcome('restless', 'play', roll)).toBe('learned')
    expect(rollOutcome('restless', 'patience', roll)).not.toBe('learned')
  })

  it('only ever returns a known outcome, across the whole roll range', () => {
    for (let roll = 0; roll < 1; roll += 0.01) {
      expect(OUTCOME_ORDER).toContain(rollOutcome('curious', 'treat', roll))
    }
  })

  it('scores a learned outcome above an almost, and nothing at zero', () => {
    expect(OUTCOME_POINTS.learned).toBeGreaterThan(OUTCOME_POINTS.almost)
    expect(OUTCOME_POINTS.almost).toBeGreaterThan(OUTCOME_POINTS.nothing)
    expect(OUTCOME_POINTS.nothing).toBe(0)
  })
})

describe('lessonMoodForDay', () => {
  it('is stable for the same day, so reopening the app shows the same mood', () => {
    expect(lessonMoodForDay('2026-09-02')).toBe(lessonMoodForDay('2026-09-02'))
  })

  it('varies across a week rather than sticking on one mood', () => {
    const week = [
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
    ]
    expect(new Set(week.map(lessonMoodForDay)).size).toBeGreaterThan(1)
  })

  it('reaches every mood over a long enough stretch', () => {
    const seen = new Set<string>()
    for (let d = 0; d < 120; d++) {
      const date = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10)
      seen.add(lessonMoodForDay(date))
    }
    expect(seen.size).toBe(LESSON_MOODS.length)
  })

  it('only ever returns a mood the odds table knows', () => {
    for (let d = 1; d <= 28; d++) {
      const key = `2026-09-${String(d).padStart(2, '0')}`
      expect(LESSON_MOODS).toContain(lessonMoodForDay(key))
    }
  })
})

describe('lesson prose', () => {
  it('has an intro line for every mood and a label to match', () => {
    for (const mood of LESSON_MOODS) {
      expect(MOOD_INTRO[mood].length).toBeGreaterThan(0)
      expect(LESSON_MOOD_LABEL[mood]).toBeTruthy()
    }
  })

  it('has lines for every approach and outcome', () => {
    for (const { id } of APPROACHES) {
      for (const outcome of OUTCOME_ORDER) {
        expect(APPROACH_OUTCOME[id][outcome].length).toBeGreaterThan(0)
      }
    }
  })

  it('offers exactly three approaches, each with a sentence-case label', () => {
    expect(APPROACHES).toHaveLength(3)
    for (const { label } of APPROACHES) expect(label).toMatch(/^[a-z]/)
  })

  it('keeps every line plain ASCII, per the app theme', () => {
    const lines = [
      ...LESSON_MOODS.flatMap((m) => MOOD_INTRO[m]),
      ...LESSON_MOODS.map((m) => LESSON_MOOD_LABEL[m]),
      ...APPROACHES.flatMap(({ id, label }) => [label, ...OUTCOME_ORDER.flatMap((o) => APPROACH_OUTCOME[id][o])]),
    ]
    for (const line of lines) expect(line).toMatch(/^[\x20-\x7E]*$/)
  })
})
