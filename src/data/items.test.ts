import { describe, expect, it } from 'vitest'
import { ITEMS, ITEM_CAP, consumables, itemById, trinkets } from './items'

describe('items', () => {
  it('has a unique id for every item', () => {
    const ids = ITEMS.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('offers both consumables and trinkets', () => {
    expect(consumables().length).toBeGreaterThan(0)
    expect(trinkets().length).toBeGreaterThan(0)
    expect(consumables().length + trinkets().length).toBe(ITEMS.length)
  })

  // An item that does nothing is a trap in a move list.
  it('gives every consumable an actual effect', () => {
    for (const item of consumables()) {
      expect(item.heal || item.damage || item.sharpen).toBeTruthy()
    }
  })

  it('gives every trinket an actual effect', () => {
    for (const item of trinkets()) {
      expect(item.bonusMaxHp || item.bonusDamage || item.softensFirstHit).toBeTruthy()
    }
  })

  it('never mixes a trinket effect into a consumable, or the reverse', () => {
    for (const item of consumables()) {
      expect(item.bonusMaxHp ?? item.bonusDamage ?? item.softensFirstHit).toBeUndefined()
    }
    for (const item of trinkets()) {
      expect(item.heal ?? item.damage ?? item.sharpen).toBeUndefined()
    }
  })

  it('keeps every name and hint plain ASCII', () => {
    for (const item of ITEMS) {
      expect(item.name).toMatch(/^[\x20-\x7E]*$/)
      expect(item.hint).toMatch(/^[\x20-\x7E]*$/)
    }
  })

  // One character wide, so a long grind cannot turn the bag into noise.
  it('caps a stack at a single digit', () => {
    expect(ITEM_CAP).toBeGreaterThan(0)
    expect(ITEM_CAP).toBeLessThan(10)
  })

  it('finds an item by id', () => {
    expect(itemById(ITEMS[0].id)).toBe(ITEMS[0])
    expect(itemById('nope')).toBeUndefined()
  })
})
