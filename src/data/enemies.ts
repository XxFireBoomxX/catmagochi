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
}

// Below this fraction of max HP a fleeing enemy starts trying to leave.
export const FLEE_THRESHOLD = 0.3

// ...but only with this chance on each of its turns, not the instant it drops
// below. Certainty made the "edging toward the wall" tell useless: the enemy
// was already gone before the player could act on it, and a balance run had a
// level 9 cat actually killing the mouse only 41% of the time. A per-turn roll
// turns the tell into a warning worth reading.
export const FLEE_CHANCE = 0.45

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
    tells: {
      idle: 'it holds its ground and stares',
      windup: 'it rears up on its back legs',
      flee: 'it holds its ground and stares',
    },
  },

  // --- the garden ---
  {
    id: "garden-snail",
    name: "garden snail",
    art: [
      "   _@_  ",
      " _(///) ",
      "/______|",
    ],
    maxHp: 22,
    damage: [2, 4],
    xp: 40,
    behaviour: "plain",
    tells: {
      idle: "it advances, in its own time",
      windup: "it advances, in its own time",
      flee: "it advances, in its own time",
    },
  },
  {
    id: "wasp",
    name: "wasp",
    art: [
      " \\ /\\ / ",
      "--(==)--",
      "   \\/   ",
    ],
    maxHp: 16,
    damage: [7, 10],
    xp: 48,
    behaviour: "windup",
    tells: {
      idle: "it hangs in the air, considering",
      windup: "it drops into a dive",
      flee: "it hangs in the air, considering",
    },
  },
  {
    id: "field-mouse",
    name: "field mouse",
    art: [
      " /\\__/\\ ",
      "( -.-  )",
      " >  ^  <",
    ],
    maxHp: 20,
    damage: [4, 6],
    xp: 44,
    behaviour: "flee",
    tells: {
      idle: "it keeps the fence at its back",
      windup: "it keeps the fence at its back",
      flee: "it is nearly at the hedge",
    },
  },
  {
    id: "magpie",
    name: "magpie",
    art: [
      "  __/)  ",
      " <(o )__",
      "  //  \\\\",
    ],
    maxHp: 44,
    damage: [8, 12],
    xp: 150,
    behaviour: "windup",
    tells: {
      idle: "it turns one eye on you, then the other",
      windup: "it spreads its wings wide",
      flee: "it turns one eye on you, then the other",
    },
  },

  // --- the shed ---
  {
    id: "cellar-spider",
    name: "cellar spider",
    art: [
      " \\_/\\_/ ",
      " -(oo)- ",
      " /_/\\_\\ ",
    ],
    maxHp: 34,
    damage: [8, 11],
    xp: 95,
    behaviour: "plain",
    tells: {
      idle: "it tests the air with one long leg",
      windup: "it tests the air with one long leg",
      flee: "it tests the air with one long leg",
    },
  },
  {
    id: "shed-rat",
    name: "shed rat",
    art: [
      "/\\____/\\",
      "( >__< )",
      " \\__^_/ ",
    ],
    maxHp: 46,
    damage: [9, 12],
    xp: 105,
    behaviour: "plain",
    tells: {
      idle: "it does not move aside",
      windup: "it does not move aside",
      flee: "it does not move aside",
    },
  },
  {
    id: "hornet",
    name: "hornet",
    art: [
      " \\\\/\\// ",
      "=<(**)>=",
      "   /\\   ",
    ],
    maxHp: 30,
    damage: [14, 18],
    xp: 120,
    behaviour: "windup",
    tells: {
      idle: "the buzzing changes pitch",
      windup: "it lines itself up with you",
      flee: "the buzzing changes pitch",
    },
  },
  {
    id: "old-tomcat",
    name: "the old tomcat",
    art: [
      " /\\_/\\  ",
      "( x.o ) ",
      " >  ~ < ",
    ],
    maxHp: 78,
    damage: [15, 20],
    xp: 320,
    behaviour: "windup",
    tells: {
      idle: "he has done this before",
      windup: "he shifts onto his back legs",
      flee: "he has done this before",
    },
  },

  // --- the cellar ---
  {
    id: "beetle-swarm",
    name: "beetle swarm",
    art: [
      ".oO.oO.o",
      "O.oO.oO.",
      ".oO.oO.o",
    ],
    maxHp: 62,
    damage: [13, 16],
    xp: 190,
    behaviour: "plain",
    tells: {
      idle: "the floor is moving",
      windup: "the floor is moving",
      flee: "the floor is moving",
    },
  },
  {
    id: "blind-mole",
    name: "blind mole",
    art: [
      " _____  ",
      "(--   ) ",
      " \\___/  ",
    ],
    maxHp: 70,
    damage: [14, 18],
    xp: 210,
    behaviour: "flee",
    tells: {
      idle: "it finds you by sound alone",
      windup: "it finds you by sound alone",
      flee: "it is digging away from you",
    },
  },
  {
    id: "cave-cricket",
    name: "cave cricket",
    art: [
      "  _/\\_  ",
      " <(--)> ",
      " //||\\\\ ",
    ],
    maxHp: 56,
    damage: [22, 28],
    xp: 240,
    behaviour: "windup",
    tells: {
      idle: "it is much too large",
      windup: "it folds its legs beneath it",
      flee: "it is much too large",
    },
  },
  {
    id: "boiler-thing",
    name: "the thing behind the boiler",
    art: [
      " ,----. ",
      "( 0  0 )",
      " `-vv-/ ",
    ],
    maxHp: 130,
    damage: [24, 32],
    xp: 700,
    behaviour: "windup",
    tells: {
      idle: "it has not blinked",
      windup: "something uncoils in the dark",
      flee: "it has not blinked",
    },
  },
]

export function enemyById(id: string): Enemy | undefined {
  return ENEMIES.find((e) => e.id === id)
}
