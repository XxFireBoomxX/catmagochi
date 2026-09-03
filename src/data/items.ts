// What the cat drags home. Two kinds, and they occupy different decision
// spaces on purpose:
//
// - Consumables are used *inside* a fight, from the same move list as skills.
//   Spending a turn on a fish scrap is a turn not spent attacking, so they
//   extend the existing tension rather than letting you sidestep it.
// - Trinkets are worn, one at a time, and change the numbers a fight *starts*
//   with rather than what you do during it.
//
// One flat shape with optional fields rather than a union per effect: there
// are six items, the fields never interact, and a discriminated union would
// buy three types and a narrowing function to save nothing.

export type ItemKind = 'consumable' | 'trinket'

export interface Item {
  id: string
  name: string
  kind: ItemKind
  // Shown in the bag and, for consumables, in the move list.
  hint: string
  // Consumable effects.
  heal?: number
  damage?: [number, number]
  sharpen?: boolean
  // Trinket effects.
  bonusMaxHp?: number
  bonusDamage?: number
  softensFirstHit?: number
}

// Stacks stop here so counts stay one character wide -- a display concern,
// not a difficulty one. Nothing is ever lost and the bag never fills up.
export const ITEM_CAP = 9

export const ITEMS: Item[] = [
  {
    id: 'fish-scrap',
    name: 'fish scrap',
    kind: 'consumable',
    hint: 'restore 4 hp',
    heal: 4,
  },
  {
    id: 'bottle-cap',
    name: 'bottle cap',
    kind: 'consumable',
    hint: 'throw it: 3 dmg',
    damage: [3, 3],
  },
  {
    id: 'catnip-leaf',
    name: 'catnip leaf',
    kind: 'consumable',
    hint: '+2 dmg for 3 turns',
    sharpen: true,
  },
  {
    id: 'bent-whisker',
    name: 'bent whisker',
    kind: 'trinket',
    hint: '+2 max hp',
    bonusMaxHp: 2,
  },
  {
    id: 'beetle-shell',
    name: 'beetle shell',
    kind: 'trinket',
    hint: 'the first hit lands softer',
    softensFirstHit: 1,
  },
  {
    id: 'rat-tooth',
    name: 'rat tooth',
    kind: 'trinket',
    hint: '+1 dmg on every attack',
    bonusDamage: 1,
  },

  // --- deeper grounds. Each boss trinket is plainly better than the last, so
  // clearing a zone changes how the next one plays rather than only adding a
  // number to a list.
  {
    id: 'garden-herb',
    name: 'garden herb',
    kind: 'consumable',
    hint: 'restore 8 hp',
    heal: 8,
  },
  {
    id: 'rusty-nail',
    name: 'rusty nail',
    kind: 'consumable',
    hint: 'throw it: 6 dmg',
    damage: [6, 6],
  },
  {
    id: 'ember-scrap',
    name: 'ember scrap',
    kind: 'consumable',
    hint: '+2 dmg for 3 turns',
    sharpen: true,
  },
  {
    id: 'crow-feather',
    name: 'crow feather',
    kind: 'trinket',
    hint: '+2 dmg on every attack',
    bonusDamage: 2,
  },
  {
    id: 'torn-collar',
    name: 'torn collar',
    kind: 'trinket',
    hint: 'the first hit lands much softer',
    softensFirstHit: 2,
  },
  {
    id: 'boiler-bolt',
    name: 'boiler bolt',
    kind: 'trinket',
    hint: '+5 max hp',
    bonusMaxHp: 5,
  },
]

export function itemById(id: string): Item | undefined {
  return ITEMS.find((i) => i.id === id)
}

export function consumables(): Item[] {
  return ITEMS.filter((i) => i.kind === 'consumable')
}

export function trinkets(): Item[] {
  return ITEMS.filter((i) => i.kind === 'trinket')
}
