// Hunting grounds. One for now -- slice 4 adds the garden, the shed and the
// cellar. Each is a run of ordinary encounters ending in a boss.

export interface Zone {
  id: string
  name: string
  unlockLevel: number
  // How many wins clear the zone. The last one is always the boss.
  length: number
  // The regular roster, drawn from at random before the boss.
  encounters: string[]
  boss: string
}

export const ZONES: Zone[] = [
  {
    id: 'kitchen',
    name: 'the kitchen',
    unlockLevel: 1,
    length: 8,
    encounters: ['crumb-beetle', 'house-mouse', 'grasshopper'],
    boss: 'pantry-rat',
  },
  {
    id: 'garden',
    name: 'the garden',
    unlockLevel: 4,
    length: 10,
    encounters: ['garden-snail', 'field-mouse', 'wasp'],
    boss: 'magpie',
  },
  {
    id: 'shed',
    name: 'the shed',
    unlockLevel: 8,
    length: 12,
    encounters: ['cellar-spider', 'shed-rat', 'hornet'],
    boss: 'old-tomcat',
  },
  {
    id: 'cellar',
    name: 'the cellar',
    unlockLevel: 12,
    length: 14,
    encounters: ['beetle-swarm', 'blind-mole', 'cave-cricket'],
    boss: 'boiler-thing',
  },
]

export function zoneById(id: string): Zone | undefined {
  return ZONES.find((z) => z.id === id)
}

// Which enemy is next, given how many the cat has already cleared here.
// `roll` is a number in [0, 1) supplied by the caller rather than read from
// Math.random() inside, so a run can be replayed exactly in a test.
//
// A cleared zone stays open and keeps serving its regular roster -- the boss
// is the milestone, not a door that closes behind you.
export function encounterFor(zone: Zone, cleared: number, roll: number): string {
  if (cleared === zone.length - 1) return zone.boss
  return zone.encounters[Math.floor(roll * zone.encounters.length) % zone.encounters.length]
}
