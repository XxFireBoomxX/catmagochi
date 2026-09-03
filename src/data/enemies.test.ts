import { describe, expect, it } from 'vitest'
import { ENEMIES, enemyById, FLEE_THRESHOLD } from './enemies'

describe('enemies', () => {
  it('has a unique id for every enemy', () => {
    const ids = ENEMIES.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // Ragged art would jump around as the enemy swaps in and out of the panel.
  it('gives every enemy three lines of art of equal width', () => {
    for (const e of ENEMIES) {
      expect(e.art).toHaveLength(3)
      expect(new Set(e.art.map((l) => l.length)).size).toBe(1)
    }
  })

  it('keeps art, names and tells plain ASCII', () => {
    for (const e of ENEMIES) {
      for (const line of [e.name, ...e.art, ...Object.values(e.tells)]) {
        expect(line).toMatch(/^[\x20-\x7E]*$/)
      }
    }
  })

  it('gives every enemy positive HP, XP and a sane damage range', () => {
    for (const e of ENEMIES) {
      expect(e.maxHp).toBeGreaterThan(0)
      expect(e.xp).toBeGreaterThan(0)
      expect(e.damage[0]).toBeLessThanOrEqual(e.damage[1])
      expect(e.damage[0]).toBeGreaterThanOrEqual(0)
    }
  })

  it('covers all three behaviours across the roster', () => {
    expect(new Set(ENEMIES.map((e) => e.behaviour))).toEqual(new Set(['plain', 'flee', 'windup']))
  })

  it('flees only when badly hurt', () => {
    expect(FLEE_THRESHOLD).toBeGreaterThan(0)
    expect(FLEE_THRESHOLD).toBeLessThan(0.5)
  })

  it('finds an enemy by id', () => {
    expect(enemyById(ENEMIES[0].id)).toBe(ENEMIES[0])
    expect(enemyById('nope')).toBeUndefined()
  })
})
