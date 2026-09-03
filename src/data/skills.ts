// What the cat can do in a fight. Every skill costs something -- damage-free
// ones spend the turn, strong ones lock themselves out for a while -- so
// picking a move is a read of the situation rather than "press the biggest
// number".

export interface Skill {
  id: string
  name: string
  // Shown under the name in the move list.
  hint: string
  unlockLevel: number
  // Turns before it can be used again. 0 means never blocked.
  cooldown: number
  // [min, max], inclusive. Null for a skill that deals no damage at all.
  damage: [number, number] | null
  effect: 'sharpen' | 'guard' | 'stun' | null
}

export const SKILLS: Skill[] = [
  {
    id: 'swipe',
    name: 'swipe',
    hint: '2-4 dmg',
    unlockLevel: 1,
    cooldown: 0,
    damage: [2, 4],
    effect: null,
  },
  {
    id: 'pounce',
    name: 'pounce',
    hint: '5-7 dmg, 2 turn cooldown',
    unlockLevel: 2,
    cooldown: 2,
    damage: [5, 7],
    effect: null,
  },
  {
    id: 'sharpen',
    name: 'sharpen claws',
    hint: '+2 dmg for 3 turns',
    unlockLevel: 4,
    cooldown: 3,
    damage: null,
    effect: 'sharpen',
  },
  {
    id: 'guard',
    name: 'flatten ears',
    hint: 'block the next hit',
    unlockLevel: 6,
    cooldown: 2,
    damage: null,
    effect: 'guard',
  },
  {
    id: 'hiss',
    name: 'hiss',
    hint: 'it loses its next turn',
    unlockLevel: 8,
    cooldown: 4,
    damage: null,
    effect: 'stun',
  },
]

export function skillById(id: string): Skill | undefined {
  return SKILLS.find((s) => s.id === id)
}
