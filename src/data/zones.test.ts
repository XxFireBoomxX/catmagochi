import { describe, expect, it } from 'vitest'
import { ZONES, encounterFor, zoneById } from './zones'
import { enemyById } from './enemies'

const kitchen = ZONES[0]

describe('zones', () => {
  it('unlocks the first zone from level 1', () => {
    expect(kitchen.unlockLevel).toBe(1)
  })

  it('references only real enemies', () => {
    for (const zone of ZONES) {
      for (const id of [...zone.encounters, zone.boss]) expect(enemyById(id)).toBeDefined()
    }
  })

  it('gives every zone room for more than just its boss', () => {
    for (const zone of ZONES) {
      expect(zone.length).toBeGreaterThan(1)
      expect(zone.encounters.length).toBeGreaterThan(0)
    }
  })

  it('finds a zone by id', () => {
    expect(zoneById(kitchen.id)).toBe(kitchen)
    expect(zoneById('nope')).toBeUndefined()
  })
})

describe('encounterFor', () => {
  it('picks a regular enemy before the end', () => {
    expect(kitchen.encounters).toContain(encounterFor(kitchen, 0, 0))
  })

  it('spans the whole encounter table across the roll range', () => {
    const seen = new Set<string>()
    for (let roll = 0; roll < 1; roll += 0.01) seen.add(encounterFor(kitchen, 0, roll))
    expect(seen.size).toBe(new Set(kitchen.encounters).size)
  })

  it('serves the boss as the final encounter, whatever the roll', () => {
    expect(encounterFor(kitchen, kitchen.length - 1, 0)).toBe(kitchen.boss)
    expect(encounterFor(kitchen, kitchen.length - 1, 0.99)).toBe(kitchen.boss)
  })

  // Clearing a zone doesn't close it -- you can keep hunting there.
  it('keeps serving regular enemies once the zone is cleared', () => {
    expect(kitchen.encounters).toContain(encounterFor(kitchen, kitchen.length, 0))
  })
})

// --- slice 4: the full ladder ---

describe('the ladder of zones', () => {
  it('opens the zones in ascending order of level', () => {
    for (let i = 1; i < ZONES.length; i++) {
      expect(ZONES[i].unlockLevel).toBeGreaterThan(ZONES[i - 1].unlockLevel)
    }
  })

  it('gives every zone a boss that is not one of its regulars', () => {
    for (const zone of ZONES) {
      expect(zone.encounters).not.toContain(zone.boss)
    }
  })

  it('gives every zone its own boss', () => {
    const bosses = ZONES.map((z) => z.boss)
    expect(new Set(bosses).size).toBe(bosses.length)
  })

  it('never reuses a regular enemy between zones', () => {
    const seen = new Set<string>()
    for (const zone of ZONES) {
      for (const id of zone.encounters) {
        expect(seen.has(id), `${id} appears in more than one zone`).toBe(false)
        seen.add(id)
      }
    }
  })

  it('offers more than one hunting ground to climb through', () => {
    expect(ZONES.length).toBeGreaterThan(1)
  })
})
