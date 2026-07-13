import type { Mood, Stage } from '../types'

// The cat is the user's reference braille art, embedded VERBATIM — do not
// regenerate or "improve" it. Animation is character-level surgery on the
// eye rows only (rows 8-10): the pupils (⢼⣿ / ⣾⣷) slide within the eye
// holes for an idle glancing loop, and blinking/sleeping swaps the holes
// for a closed lid (⣿ fill over a ⠉ lash line). Every character outside
// those rows is always exactly the reference art. Growth stages render the
// same art at different font sizes (see .cat-sprite stage classes).

const BASE: string[] = [
  '⠀⠀⠀⠀⠀⠀⠀⢠⣿⣿⣦⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣴⣿⣦⡀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⢠⣿⣿⣿⣿⣆⠀⠀⠀⠀⠀⠀⠀⠀⣾⣿⣿⣿⣷⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⢀⣾⣿⣿⣿⣿⣿⡆⠀⠀⠀⠀⠀⠀⣸⣿⣿⣿⣿⣿⡆⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⣾⣿⣿⣿⣿⣿⣿⣿⡀⠀⠀⠀⠀⢀⣿⣿⣿⣿⣿⣿⣿⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⢸⣿⣿⣿⣿⣿⣿⣿⣿⣧⠀⠀⠀⠀⣼⣿⣿⣿⣿⣿⣿⣿⡇⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣠⣤⣤⣼⣿⣿⣿⣿⣿⣿⣿⣿⣷⠀⠀⠀⠀⠀',
  '⠀⠀⠀⢀⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠀⠀⠀⠀⠀',
  '⠀⠀⠀⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠘⣿⣿⣿⣿⠟⠁⠀⠀⠀⠹⣿⣿⣿⣿⣿⠟⠁⠀⠀⠹⣿⣿⡿⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⣿⣿⣿⡇⠀⠀⠀⢼⣿⠀⢿⣿⣿⣿⣿⠀⣾⣷⠀⠀⢿⣿⣷⠀⠀⠀⠀⠀',
  '⠀⠀⠀⢠⣿⣿⣿⣷⡀⠀⠀⠈⠋⢀⣿⣿⣿⣿⣿⡀⠙⠋⠀⢀⣾⣿⣿⠀⠀⠀⠀⠀',
  '⢀⣀⣀⣀⣿⣿⣿⣿⣿⣶⣶⣶⣶⣿⣿⣿⣿⣾⣿⣷⣦⣤⣴⣿⣿⣿⣿⣤⠤⢤⣤⡄',
  '⠈⠉⠉⢉⣙⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣇⣀⣀⣀⡀⠀',
  '⠐⠚⠋⠉⢀⣬⡿⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⣥⣀⡀⠈⠀⠈⠛',
  '⠀⠀⠴⠚⠉⠀⠀⠀⠉⠛⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠛⠋⠁⠀⠀⠀⠉⠛⠢⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⣸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⣰⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣧⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⢠⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⢠⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⢠⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⢠⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣧⠀⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡄⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇⠀⠀⠀⠀⠀⠀⠀⠀',
]

const B = '⠀' // braille blank (U+2800), matches the art's own padding

// Eye anatomy in the art (verified char indices):
// row 9 — left hole interior cols 8..13, pupil '⢼⣿' at col 11;
//         right hole interior cols 19..23, pupil '⣾⣷' at col 20.
// row 10 — pupil shading '⠈⠋' at col 11 and '⠙⠋' at col 20.
const LEFT_PUPIL = '⢼⣿'
const RIGHT_PUPIL = '⣾⣷'

// Pupil slide per idle frame; offsets keep both pupils inside their holes.
const LEFT_OFFSETS = [0, -2, 0, 1]
const RIGHT_OFFSETS = [0, -1, 0, 1]

export const IDLE_FRAME_COUNT: Record<Stage, number> = {
  kitten: LEFT_OFFSETS.length,
  young: LEFT_OFFSETS.length,
  adult: LEFT_OFFSETS.length,
}

function replaceAt(row: string, idx: number, insert: string): string {
  return row.slice(0, idx) + insert + row.slice(idx + insert.length)
}

function openEyes(idleFrame: number): string[] {
  const loff = LEFT_OFFSETS[idleFrame % LEFT_OFFSETS.length]
  const roff = RIGHT_OFFSETS[idleFrame % RIGHT_OFFSETS.length]
  const rows = [...BASE]
  let r9 = rows[9]
  r9 = replaceAt(r9, 8, B.repeat(6))
  r9 = replaceAt(r9, 19, B.repeat(5))
  r9 = replaceAt(r9, 11 + loff, LEFT_PUPIL)
  r9 = replaceAt(r9, 20 + roff, RIGHT_PUPIL)
  rows[9] = r9
  if (loff !== 0 || roff !== 0) {
    // the row-10 shading sits under the centered pupil; drop it when glancing
    rows[10] = replaceAt(replaceAt(rows[10], 11, B.repeat(2)), 20, B.repeat(2))
  }
  return rows
}

function closedEyes(): string[] {
  const rows = [...BASE]
  rows[8] = replaceAt(replaceAt(rows[8], 8, '⣿'.repeat(6)), 19, '⣿'.repeat(5))
  rows[9] = replaceAt(replaceAt(rows[9], 8, '⠉'.repeat(6)), 19, '⠉'.repeat(5))
  rows[10] = replaceAt(replaceAt(rows[10], 11, B.repeat(2)), 20, B.repeat(2))
  return rows
}

const cache = new Map<string, string>()

export function buildFrame(mood: Mood, blinkFrame: 0 | 1, _stage: Stage, idleFrame: number): string {
  const closed = blinkFrame === 1 || mood === 'sleeping'
  const key = closed ? 'closed' : `open${idleFrame % LEFT_OFFSETS.length}`
  const hit = cache.get(key)
  if (hit) return hit
  const out = (closed ? closedEyes() : openEyes(idleFrame)).join('\n')
  cache.set(key, out)
  return out
}
