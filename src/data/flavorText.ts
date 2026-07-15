import type { Mood } from '../types'

export const MOOD_LABEL: Record<Mood, string> = {
  happy: 'is happy!',
  content: 'is doing okay.',
  hungry: 'is hungry...',
  tired: 'is tired...',
  dirty: 'needs a bath!',
  sad: 'is feeling sad.',
  sleeping: 'is sleeping. Zzz',
}

export const FLAVOR_TEXT: Partial<Record<Mood, string[]>> = {
  sleeping: ['snores softly... zzz', 'twitches in a dream', 'curled up in a tight ball'],
  hungry: ['eyes the food bowl', 'tummy rumbles', 'sniffs around for snacks'],
  happy: ['purrs contentedly', 'does a happy little wiggle', 'headbutts the air'],
  tired: ['yawns widely', 'struggles to keep eyes open'],
  dirty: ['tries to lick a paw clean', 'leaves little paw prints around'],
  sad: ['stares off into the distance', 'lets out a small mew'],
}

export const GENERIC_FLAVOR: string[] = [
  'purrs softly...',
  'flicks tail',
  'kneads the air',
  'stares at nothing',
  'blinks slowly at you',
  'stretches',
]

// A small chance of one of these replacing the mood caption right after an
// action, instead of the usual steady-state MOOD_LABEL line — see
// ACTION_FLAVOR_CHANCE in App.tsx.
export const ACTION_FLAVOR: Record<'feed' | 'clean' | 'sleep' | 'wake' | 'pet', string[]> = {
  feed: ['smacks its lips', 'goes back for seconds', 'gives an approving nod'],
  clean: ['smells like fresh linen', 'preens proudly', 'shakes off the last suds'],
  sleep: ['already snoring', 'curls into the tightest ball'],
  wake: ['stretches out every limb', 'blinks awake slowly'],
  pet: ['leans into your hand', 'melts a little', 'purrs extra loud'],
}
