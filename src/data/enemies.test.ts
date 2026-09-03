import { describe, expect, it } from 'vitest'
import { ENEMIES, enemyById, FLEE_THRESHOLD } from './enemies'
import { ZONES } from './zones'

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

// --- slice 4: the difficulty ladder ---

describe('enemy strength ascends by zone', () => {
  // Rough stand-in for "how dangerous is this": health plus the damage it can
  // put out. A later zone whose enemies were not harder would make the level
  // requirement a formality.
  const threat = (id: string) => {
    const e = enemyById(id)!
    return e.maxHp + (e.damage[0] + e.damage[1]) * 2
  }

  it('makes each zone tougher than the one before it', () => {
    const perZone = ZONES.map((z) => Math.max(...z.encounters.map(threat)))
    for (let i = 1; i < perZone.length; i++) {
      expect(perZone[i], `zone ${i} is not harder than zone ${i - 1}`).toBeGreaterThan(perZone[i - 1])
    }
  })

  it('pays more for the harder zones', () => {
    const perZone = ZONES.map((z) => Math.max(...z.encounters.map((id) => enemyById(id)!.xp)))
    for (let i = 1; i < perZone.length; i++) {
      expect(perZone[i]).toBeGreaterThan(perZone[i - 1])
    }
  })

  it('makes every boss the hardest thing in its own zone', () => {
    for (const zone of ZONES) {
      const toughestRegular = Math.max(...zone.encounters.map(threat))
      expect(threat(zone.boss), `${zone.boss} is not the hardest in ${zone.id}`).toBeGreaterThan(toughestRegular)
    }
  })
})
