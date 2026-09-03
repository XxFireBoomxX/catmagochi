import { describe, expect, it } from 'vitest'
import { DROPS, rollLoot } from './loot'
import { ENEMIES } from './enemies'
import { itemById } from './items'

describe('drop tables', () => {
  it('gives every enemy a table', () => {
    for (const enemy of ENEMIES) expect(DROPS[enemy.id]).toBeDefined()
  })

  it('references only real items', () => {
    for (const table of Object.values(DROPS)) {
      for (const id of table) {
        if (id !== null) expect(itemById(id)).toBeDefined()
      }
    }
  })

  // Sparse on purpose: a trinket every single fight makes the bag a chore.
  it('leaves ordinary enemies empty-handed some of the time', () => {
    expect(DROPS['crumb-beetle']).toContain(null)
  })

  it('always pays out for the boss', () => {
    expect(DROPS['pantry-rat']).not.toContain(null)
  })
})

describe('rollLoot', () => {
  it('spans the whole table across the roll range', () => {
    const seen = new Set<string | null>()
    for (let roll = 0; roll < 1; roll += 0.01) seen.add(rollLoot('crumb-beetle', roll))
    expect(seen.size).toBe(new Set(DROPS['crumb-beetle']).size)
  })

  it('returns something real at the very bottom and top of the range', () => {
    expect(DROPS['pantry-rat']).toContain(rollLoot('pantry-rat', 0))
    expect(DROPS['pantry-rat']).toContain(rollLoot('pantry-rat', 0.999))
  })

  it('drops nothing for an enemy it does not know', () => {
    expect(rollLoot('not-an-enemy', 0)).toBeNull()
  })
})
