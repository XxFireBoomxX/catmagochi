// The trick curriculum, in teaching order: easiest first, and increasingly
// unlikely toward the end -- "fetch" and "come when called" are funny for a
// cat precisely because a cat has no intention of doing either.
//
// Lines are what she does when *performing* an already-learned trick, which
// is unlimited and free (see TrickPanel). A refusal is not a failure state:
// it's most of the charm, so the refusal lines get the better writing.

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
      'Mia sits. Perfectly. As though she has never done anything else.',
      'Down she goes, tail curled neatly around her feet.',
    ],
    refusal: [
      'Mia considers sitting, then sits somewhere else entirely.',
      'Mia hears you. Mia does not sit.',
    ],
  },
  {
    id: 'shake-paw',
    name: 'shake paw',
    success: [
      'Mia lifts a paw and drops it into your hand.',
      'One paw, offered like a formal greeting.',
    ],
    refusal: [
      'Mia inspects your hand. Your hand is not food. Mia leaves.',
      'A paw comes up, hovers, and goes back down.',
    ],
  },
  {
    id: 'high-five',
    name: 'high five',
    success: [
      'Mia smacks your palm with surprising force.',
      'Up goes the paw. Contact. Excellent.',
    ],
    refusal: [
      'Mia bats at your hand and misses on purpose.',
      'Mia raises a paw, then uses it to wash her face.',
    ],
  },
  {
    id: 'spin',
    name: 'spin',
    success: [
      'Mia turns a full circle and looks extremely pleased about it.',
      'One neat spin, with a small hop at the end.',
    ],
    refusal: [
      'Mia turns halfway around and forgets why.',
      'Mia spins. In the wrong direction. Twice.',
    ],
  },
  {
    id: 'lie-down',
    name: 'lie down',
    success: [
      'Mia flops onto her side with a small thump.',
      'Down she goes, all at once, as though switched off.',
    ],
    refusal: [
      'Mia lies down three feet away, facing the other way.',
      'Mia sits instead, daring you to correct her.',
    ],
  },
  {
    id: 'roll-over',
    name: 'roll over',
    success: [
      'Mia rolls right over and lands with her feet in the air.',
      'Over she goes, tail whipping around after her.',
    ],
    refusal: [
      'Mia rolls halfway, gets comfortable, and stops there.',
      'Mia lies down and declines to go any further.',
    ],
  },
  {
    id: 'play-dead',
    name: 'play dead',
    success: [
      'Mia collapses dramatically and holds very still.',
      'Mia goes limp mid-step. An outstanding performance.',
    ],
    refusal: [
      'Mia plays dead for slightly under one second.',
      'Mia flops over and immediately starts purring, ruining it.',
    ],
  },
  {
    id: 'fetch',
    name: 'fetch',
    success: [
      'Mia brings it back. Nobody is more surprised than you.',
      'Off she goes, and back she comes, item in mouth.',
    ],
    refusal: [
      'Mia watches it fly, then looks at you like you have lost something.',
      'Mia fetches it and keeps it. It is hers now.',
    ],
  },
  {
    id: 'come',
    name: 'come when called',
    success: [
      'Mia comes when called. On the first try.',
      'She trots over the moment she hears her name.',
    ],
    refusal: [
      'Mia hears her name, blinks slowly, and stays exactly where she is.',
      'Mia comes over, then keeps going. She was headed there anyway.',
    ],
  },
  {
    id: 'hoop',
    name: 'jump through the hoop',
    success: [
      'Mia sails clean through the hoop.',
      'Through the middle, no hesitation, perfect landing.',
    ],
    refusal: [
      'Mia walks around the hoop rather than through it.',
      'Mia sits down inside the hoop and looks at you.',
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
