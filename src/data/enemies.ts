// What the cat hunts. Behaviour is the point: four enemies with the same
// "attack every turn" rule would be one enemy with four HP totals, and the
// choice of move would collapse to "biggest number".
//
// Art is small plain ASCII, three lines of equal width -- it sits next to a
// much larger braille cat inside a narrow panel, so it has to read at a
// glance and never change the panel's height.

export type Behaviour =
  // Attacks every turn. Nothing to read, which makes it the tutorial.
  | 'plain'
  // Runs once badly hurt. Rewards finishing fast over setting up.
  | 'flee'
  // Spends a turn winding up, then hits hard. The wind-up is telegraphed in
  // its tell, so blocking has an obvious right moment.
  | 'windup'

export interface Enemy {
  id: string
  name: string
  art: string[]
  maxHp: number
  damage: [number, number]
  xp: number
  behaviour: Behaviour
  tells: { idle: string; windup: string; flee: string }
  // Bosses hold their ground however hurt they are.
  steadfast?: boolean
}

// Below this fraction of max HP a fleeing enemy tries to leave.
export const FLEE_THRESHOLD = 0.3

export const ENEMIES: Enemy[] = [
  {
    id: 'crumb-beetle',
    name: 'crumb beetle',
    art: [
      '  ____  ',
      ' /.--.\\ ',
      ' \\_||_/ ',
    ],
    maxHp: 6,
    damage: [1, 2],
    xp: 10,
    behaviour: 'plain',
    tells: {
      idle: 'it trundles in a small circle',
      windup: 'it trundles in a small circle',
      flee: 'it trundles in a small circle',
    },
  },
  {
    id: 'house-mouse',
    name: 'house mouse',
    art: [
      '  /\\_/\\ ',
      ' ( o.o )',
      '  > ^ < ',
    ],
    maxHp: 10,
    damage: [2, 3],
    xp: 18,
    behaviour: 'flee',
    tells: {
      idle: 'it watches your paws, not your eyes',
      windup: 'it watches your paws, not your eyes',
      flee: 'it is edging toward the wall',
    },
  },
  {
    id: 'grasshopper',
    name: 'grasshopper',
    art: [
      '  __/\\  ',
      ' <(oo)> ',
      '  /||\\  ',
    ],
    maxHp: 12,
    damage: [5, 7],
    xp: 25,
    behaviour: 'windup',
    tells: {
      idle: 'it rubs its back legs together',
      windup: 'it is coiling to spring',
      flee: 'it rubs its back legs together',
    },
  },
  {
    id: 'pantry-rat',
    name: 'pantry rat',
    art: [
      ' /\\___/\\',
      '( >.<  )',
      ' \\__^__/',
    ],
    maxHp: 26,
    damage: [3, 5],
    xp: 70,
    behaviour: 'windup',
    steadfast: true,
    tells: {
      idle: 'it holds its ground and stares',
      windup: 'it rears up on its back legs',
      flee: 'it holds its ground and stares',
    },
  },
]

export function enemyById(id: string): Enemy | undefined {
  return ENEMIES.find((e) => e.id === id)
}
