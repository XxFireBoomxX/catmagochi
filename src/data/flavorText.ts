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
