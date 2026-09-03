import { itemById } from './items'

// How level and worn equipment show on the cat itself.
//
// `asciiCat.ts`'s BASE is not touched here, and this module is not a door to
// touching it. The art is embedded verbatim; everything below draws *around*
// it or restyles it, never edits it.
//
// The collar is its own line beneath the sprite rather than an overlay: the
// sprite's font-size is a clamp() that moves with the viewport, so anything
// absolutely positioned against it drifts on a different screen. A sibling
// line in the same flex column is centred by layout and cannot.

const COLLAR_CHARM: Record<string, string> = {
  'bent-whisker': '~',
  'beetle-shell': 'o',
  'rat-tooth': '^',
}

// One row, worn under the chin. Null when nothing is worn, when the id is
// unknown, or when it names a consumable -- those are used, not worn.
export function collarFor(trinketId: string | null | undefined): string | null {
  if (!trinketId) return null
  const item = itemById(trinketId)
  if (item?.kind !== 'trinket') return null
  const charm = COLLAR_CHARM[trinketId]
  if (!charm) return null
  return `--==[ ${charm} ]==--`
}

// How many palette bands the cat moves through as it levels.
export const LEVEL_BANDS = 5

// Bands rather than a per-level change: one level of difference would be
// invisible, while a band is something you notice after a week away. Band 1
// is deliberately identical to the pre-slice look, so levelling reads as
// progress rather than as a restyle.
export function levelBand(level: number): number {
  if (!Number.isFinite(level) || level < 1) return 1
  return Math.min(LEVEL_BANDS, Math.floor((level - 1) / 2) + 1)
}
