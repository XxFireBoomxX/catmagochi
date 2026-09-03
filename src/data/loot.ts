// What each enemy might be carrying. A table is a flat list of outcomes and
// `null` means "nothing this time" -- so the drop rate is expressed by how
// many empty slots a table has rather than by a separate probability, which
// keeps the whole economy readable at a glance.
//
// Deliberately sparse: a trinket after every single fight turns the bag into
// a chore to read instead of a thing worth checking. The boss is the
// exception -- clearing a zone should always pay.

export const DROPS: Record<string, (string | null)[]> = {
  'crumb-beetle': [null, null, 'fish-scrap', 'bottle-cap'],
  'house-mouse': [null, null, 'fish-scrap', 'catnip-leaf', 'bent-whisker'],
  grasshopper: [null, null, 'catnip-leaf', 'beetle-shell'],
  'pantry-rat': ['rat-tooth', 'catnip-leaf', 'fish-scrap'],

  'garden-snail': [null, null, 'garden-herb', 'fish-scrap'],
  'field-mouse': [null, null, 'garden-herb', 'rusty-nail'],
  wasp: [null, null, 'rusty-nail', 'garden-herb'],
  magpie: ['crow-feather', 'garden-herb', 'rusty-nail'],

  'cellar-spider': [null, null, 'rusty-nail', 'ember-scrap'],
  'shed-rat': [null, null, 'garden-herb', 'ember-scrap'],
  hornet: [null, null, 'ember-scrap', 'rusty-nail'],
  'old-tomcat': ['torn-collar', 'ember-scrap', 'garden-herb'],

  'beetle-swarm': [null, null, 'ember-scrap', 'garden-herb'],
  'blind-mole': [null, null, 'ember-scrap', 'rusty-nail'],
  'cave-cricket': [null, null, 'ember-scrap', 'garden-herb'],
  'boiler-thing': ['boiler-bolt', 'ember-scrap', 'garden-herb'],
}

// `roll` is a number in [0, 1) supplied by the caller rather than read from
// Math.random() inside, so a run replays exactly in a test.
export function rollLoot(enemyId: string, roll: number): string | null {
  const table = DROPS[enemyId]
  if (!table || table.length === 0) return null
  return table[Math.floor(roll * table.length) % table.length]
}
