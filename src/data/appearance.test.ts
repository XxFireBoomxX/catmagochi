import { describe, expect, it } from 'vitest'
import { collarFor, levelBand, LEVEL_BANDS } from './appearance'
import { consumables, trinkets } from './items'

describe('collarFor', () => {
  it('gives every trinket a collar', () => {
    for (const trinket of trinkets()) {
      expect(collarFor(trinket.id)).toBeTruthy()
    }
  })

  // Three identical collars would make the equipment slot invisible.
  it('gives each trinket a distinct one', () => {
    const collars = trinkets().map((t) => collarFor(t.id))
    expect(new Set(collars).size).toBe(collars.length)
  })

  it('keeps every collar plain ASCII, on one line', () => {
    for (const trinket of trinkets()) {
      const collar = collarFor(trinket.id)!
      expect(collar).toMatch(/^[\x20-\x7E]*$/)
      expect(collar).not.toContain('\n')
    }
  })

  it('renders nothing for a consumable -- those are used, not worn', () => {
    for (const item of consumables()) {
      expect(collarFor(item.id)).toBeNull()
    }
  })

  it('renders nothing for an unknown id, or for nothing worn', () => {
    expect(collarFor('not-an-item')).toBeNull()
    expect(collarFor(null)).toBeNull()
    expect(collarFor(undefined)).toBeNull()
  })
})

describe('levelBand', () => {
  // Band 1 must look exactly like the app did before this slice, so the
  // change reads as progress rather than as a restyle.
  it('starts a new cat in the first band', () => {
    expect(levelBand(1)).toBe(1)
    expect(levelBand(2)).toBe(1)
  })

  it('moves up as the level rises', () => {
    expect(levelBand(3)).toBeGreaterThan(levelBand(2))
    expect(levelBand(9)).toBeGreaterThan(levelBand(5))
  })

  it('never goes backwards', () => {
    for (let level = 1; level < 30; level++) {
      expect(levelBand(level + 1)).toBeGreaterThanOrEqual(levelBand(level))
    }
  })

  it('clamps at both ends rather than falling off', () => {
    expect(levelBand(0)).toBe(1)
    expect(levelBand(-5)).toBe(1)
    expect(levelBand(999)).toBe(LEVEL_BANDS)
  })

  it('reaches the top band at a level the game can actually deliver', () => {
    expect(levelBand(9)).toBe(LEVEL_BANDS)
  })
})
