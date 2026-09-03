// The trick curriculum, in teaching order: easiest first, and increasingly
// unlikely toward the end -- "fetch" and "come when called" are funny for a
// cat precisely because a cat has no intention of doing either.
//
// Lines are what she does when *performing* an already-learned trick, which
// is unlimited and free (see TrickPanel). A refusal is not a failure state:
// it's most of the charm, so the refusal lines get the better writing.
//
// {name} is replaced with the pet's actual name at render time -- the cat is
// whatever the user called it at adoption, so no line may hardcode one.

export interface Trick {
  id: string
  name: string
  success: string[]
  refusal: string[]
}

// Lesson points needed to learn one trick. A well-chosen approach averages
// ~1.45 points a day, a poor one ~0.55, so a trick lands somewhere between
// six and fifteen days depending on how you play.
export const TRICK_POINTS = 8

export const TRICKS: Trick[] = [
  {
    id: 'sit',
    name: 'sit',
    success: [
      '{name} sits. Perfectly. As though she has never done anything else.',
      'Down she goes, tail curled neatly around her feet.',
    ],
    refusal: [
      '{name} considers sitting, then sits somewhere else entirely.',
      '{name} hears you. {name} does not sit.',
    ],
  },
  {
    id: 'shake-paw',
    name: 'shake paw',
    success: [
      '{name} lifts a paw and drops it into your hand.',
      'One paw, offered like a formal greeting.',
    ],
    refusal: [
      '{name} inspects your hand. Your hand is not food. {name} leaves.',
      'A paw comes up, hovers, and goes back down.',
    ],
  },
  {
    id: 'high-five',
    name: 'high five',
    success: [
      '{name} smacks your palm with surprising force.',
      'Up goes the paw. Contact. Excellent.',
    ],
    refusal: [
      '{name} bats at your hand and misses on purpose.',
      '{name} raises a paw, then uses it to wash her face.',
    ],
  },
  {
    id: 'spin',
    name: 'spin',
    success: [
      '{name} turns a full circle and looks extremely pleased about it.',
      'One neat spin, with a small hop at the end.',
    ],
    refusal: [
      '{name} turns halfway around and forgets why.',
      '{name} spins. In the wrong direction. Twice.',
    ],
  },
  {
    id: 'lie-down',
    name: 'lie down',
    success: [
      '{name} flops onto her side with a small thump.',
      'Down she goes, all at once, as though switched off.',
    ],
    refusal: [
      '{name} lies down three feet away, facing the other way.',
      '{name} sits instead, daring you to correct her.',
    ],
  },
  {
    id: 'roll-over',
    name: 'roll over',
    success: [
      '{name} rolls right over and lands with her feet in the air.',
      'Over she goes, tail whipping around after her.',
    ],
    refusal: [
      '{name} rolls halfway, gets comfortable, and stops there.',
      '{name} lies down and declines to go any further.',
    ],
  },
  {
    id: 'play-dead',
    name: 'play dead',
    success: [
      '{name} collapses dramatically and holds very still.',
      '{name} goes limp mid-step. An outstanding performance.',
    ],
    refusal: [
      '{name} plays dead for slightly under one second.',
      '{name} flops over and immediately starts purring, ruining it.',
    ],
  },
  {
    id: 'fetch',
    name: 'fetch',
    success: [
      '{name} brings it back. Nobody is more surprised than you.',
      'Off she goes, and back she comes, item in mouth.',
    ],
    refusal: [
      '{name} watches it fly, then looks at you like you have lost something.',
      '{name} fetches it and keeps it. It is hers now.',
    ],
  },
  {
    id: 'come',
    name: 'come when called',
    success: [
      '{name} comes when called. On the first try.',
      'She trots over the moment she hears her name.',
    ],
    refusal: [
      '{name} hears her name, blinks slowly, and stays exactly where she is.',
      '{name} comes over, then keeps going. She was headed there anyway.',
    ],
  },
  {
    id: 'hoop',
    name: 'jump through the hoop',
    success: [
      '{name} sails clean through the hoop.',
      'Through the middle, no hesitation, perfect landing.',
    ],
    refusal: [
      '{name} walks around the hoop rather than through it.',
      '{name} sits down inside the hoop and looks at you.',
    ],
  },
]

export function trickById(id: string): Trick | undefined {
  return TRICKS.find((t) => t.id === id)
}

// The first trick not yet learned. Searches the curriculum rather than
// indexing by count, so learning them out of order (or retiring one) can't
// skip anything.
export function nextTrickId(learned: string[]): string | null {
  return TRICKS.find((t) => !learned.includes(t.id))?.id ?? null
}
