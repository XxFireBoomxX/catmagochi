import { describe, expect, it } from 'vitest'
import { SKILLS, skillById } from './skills'

describe('skills', () => {
  it('has a unique id for every skill', () => {
    const ids = SKILLS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('starts the cat with exactly one skill at level 1', () => {
    expect(SKILLS.filter((s) => s.unlockLevel === 1)).toHaveLength(1)
  })

  // Without a free, always-available attack a fight could deadlock with every
  // option on cooldown.
  it('gives the level-1 skill damage and no cooldown', () => {
    const starter = SKILLS.find((s) => s.unlockLevel === 1)!
    expect(starter.cooldown).toBe(0)
    expect(starter.damage).not.toBeNull()
  })

  it('gives every skill either damage or an effect', () => {
    for (const s of SKILLS) expect(s.damage !== null || s.effect !== null).toBe(true)
  })

  // A damage-free skill spends a turn; without a cooldown it would be
  // strictly correct to spam it.
  it('puts a cooldown on every damage-free utility skill', () => {
    for (const s of SKILLS.filter((skill) => skill.damage === null)) {
      expect(s.cooldown).toBeGreaterThan(0)
    }
  })

  it('orders damage ranges low to high', () => {
    for (const s of SKILLS) {
      if (s.damage) expect(s.damage[0]).toBeLessThanOrEqual(s.damage[1])
    }
  })

  it('keeps every name and hint plain ASCII', () => {
    for (const s of SKILLS) {
      expect(s.name).toMatch(/^[\x20-\x7E]*$/)
      expect(s.hint).toMatch(/^[\x20-\x7E]*$/)
    }
  })

  it('finds a skill by id', () => {
    expect(skillById(SKILLS[0].id)).toBe(SKILLS[0])
    expect(skillById('nope')).toBeUndefined()
  })
})
