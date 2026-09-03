# The cat visibly changes — the hunt, slice 3

Level and worn equipment show on the cat itself, on the main screen, without
touching the reference art.

Slices 1 and 2 gave the cat a fight to win and things to carry. Both are behind
`[PLAY]`: close the panel and the cat looks exactly as it did on day one. This
is the slice that makes the RPG visible where you actually spend your time.

## The constraint this slice is built around

`src/data/asciiCat.ts` opens with "embedded VERBATIM — do not regenerate or
'improve' it". The art is the user's own reference image; the only animation is
character surgery on rows 8-10 for the eyes. Even growth stages do not change
it — they scale `font-size` per `.cat-sprite.stage-*`.

**`BASE` is not touched here either.** Two mechanisms give a visibly different
cat without editing a single character of it:

1. **A collar rendered as its own line beneath the cat**, when a trinket is worn.
2. **A palette that shifts with level**, applied to the sprite's colour and glow.

Overlaying ASCII on the braille art at absolute positions was considered and
rejected: the sprite's `font-size` is a `clamp()` that moves with the viewport,
so anything absolutely positioned against it drifts on a different screen. A
sibling line in the same flex column is centred by layout and cannot drift.

## The collar

One row, directly beneath the cat, present only while a trinket is worn:

```
        ⠀⠀⠀⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇
              --==[ o ]==--
```

The charm between the brackets is per trinket, so the three read differently at
a glance:

| trinket | charm |
|---|---|
| bent whisker | `~` |
| beetle shell | `o` |
| rat tooth | `^` |

One row rather than a hat plus a collar plus a tail ribbon: the panel is narrow
on a phone, the cat already fills it, and a second decorated line starts
competing with the floating caption for the same space.

## The palette

The cat's colour and glow strength move through five bands as it levels. Not a
per-level change — that would be invisible — but a shift you notice when you
come back after a week.

| band | levels | reads as |
|---|---|---|
| 1 | 1-2 | the existing look, unchanged |
| 2 | 3-4 | slightly brighter |
| 3 | 5-6 | brighter still, stronger glow |
| 4 | 7-8 | near-white core, wide glow |
| 5 | 9+ | full glow, unmistakable |

Implemented as `data-level-band` on the sprite plus CSS variables, so the bands
live in the stylesheet next to the rest of the theme rather than as inline
styles computed in a component.

Band 1 is deliberately identical to today's appearance: a level-1 cat must look
exactly like it did before this slice, so the change reads as progress rather
than as a restyle.

## Architecture

`AsciiCat` gains two optional props and stays otherwise untouched:

```ts
trinketId?: string | null   // renders the collar; null or absent renders none
level?: number              // selects the palette band; defaults to 1
```

Optional so every existing call site and test keeps working, and so the
component stays usable without the quest system — it is still the pet's sprite
first and an RPG avatar second.

`src/data/appearance.ts` holds the mapping, as pure functions:

```ts
collarFor(trinketId: string | null | undefined): string | null
levelBand(level: number): 1 | 2 | 3 | 4 | 5
```

`App.tsx` already calls `useQuest()` for the idle-flavour lines; it passes
`worn` and `level` down from the same call.

## Testing

- `appearance.ts`: every trinket has a distinct collar; a consumable id or an
  unknown id yields none; the bands cover the level range, are monotonic, and
  clamp at both ends (level 0 and level 999 both resolve).
- `AsciiCat`: no collar without a trinket; the right collar with one; the
  collar is plain ASCII; `data-level-band` reflects the level; a level-1 cat
  renders identically to one given no level at all.
- `App`: a worn trinket shows on the main screen, not only inside the panel.

## Deliberate limits

- **`BASE` is not modified, and this slice does not open that door.** Slice 4
  adds zones, not art. If the cat's own drawing ever changes, that is a
  separate decision made deliberately, not a side effect of an RPG feature.
- **One collar row.** Not a hat, not a tail ribbon, not per-slot layering —
  there is one equipment slot, so one visual.
- **The palette does not encode anything but level.** Tying it to mood or stats
  as well would make two signals fight over one channel, and mood already owns
  the caption and the glyph.
