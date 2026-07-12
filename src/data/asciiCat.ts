import type { Mood, Stage } from '../types'

export const ASCII_FRAMES: Record<Mood, [string, string]> = {
  content: [' /\\_/\\ \n( o.o )\n > - < ', ' /\\_/\\ \n( -.- )\n > - < '],
  happy: [' /\\_/\\ \n( ^.^ )\n > ^ < ', ' /\\_/\\ \n( -.- )\n > ^ < '],
  hungry: [' /\\_/\\ \n( o.O )\n > o < ', ' /\\_/\\ \n( O.o )\n > o < '],
  tired: [' /\\_/\\ \n( u.u )\n > ~ < ', ' /\\_/\\ \n( -.- )\n > ~ < '],
  dirty: [' /\\_/\\ \n( x.x )\n>~  ~<', ' /\\_/\\ \n( >.< )\n>~  ~<'],
  sad: [' /\\_/\\ \n( ;.; )\n > ~ < ', ' /\\_/\\ \n( ;_; )\n > ~ < '],
  sleeping: [' /\\_/\\ \n( -.- )\n > ~ < z', ' /\\_/\\ \n( -.- )\n > ~ < Z'],
}

const BODY_LINES: Record<Stage, string[]> = {
  kitten: [],
  young: [' /   \\ '],
  adult: [' /   \\ ', '~~   ~~'],
}

export function buildFrame(mood: Mood, frame: 0 | 1, stage: Stage): string {
  return [ASCII_FRAMES[mood][frame], ...BODY_LINES[stage]].join('\n')
}
