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

  // The app is plain ASCII throughout -- no emoji anywhere (see CLAUDE.md).
  it('keeps every line plain ASCII', () => {
    for (const trick of TRICKS) {
      for (const line of [...trick.success, ...trick.refusal]) {
        expect(line).toMatch(/^[\x20-\x7E]*$/)
      }
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
