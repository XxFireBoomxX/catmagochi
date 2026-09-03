# Three more hunting grounds — the hunt, slice 4

The last slice. The machinery is all in place; this is mostly content, plus one
UI gap that only becomes visible once there is more than one zone.

## The gap

`useQuest` exposes `unlockedZones`, and the panel renders exactly that. With a
single zone nobody could tell. With four, **you never see what is coming** —
the ladder you are climbing is invisible until you are already on the rung.

The grounds list now shows every zone, with locked ones dimmed and labelled
with the level that opens them. This is the whole reason a level number is
worth caring about, so it should not be a surprise.

## The ladder

| zone | opens at | reads as |
|---|---|---|
| the kitchen | 1 | crumbs and small trouble |
| the garden | 4 | outdoors, things with wings |
| the shed | 8 | dark, cramped, something already lives here |
| the cellar | 12 | you should not be down here |

Level 12 is roughly 4,000 XP cumulative on the existing curve. Cellar enemies
pay 180-250, so the last zone is reachable rather than aspirational, and the
climb to it runs through the zones that pay enough to make it.

## The rosters

Three regulars and a boss each, keeping the three behaviours from slice 1 —
`plain`, `flee`, `windup`. No new behaviour type: the existing three already
give every fight a read, and a fourth would need its own tell, its own art
language and its own balance pass to justify itself.

**The garden** — garden snail (slow and tanky, `plain`), wasp (`windup`, hits
hard), field mouse (`flee`, tougher than its kitchen cousin). Boss: **magpie**,
`windup`, the first enemy that genuinely out-damages a fresh arrival.

**The shed** — cellar spider (`plain`), shed rat (`plain`, heavy), hornet
(`windup`). Boss: **the old tomcat**, `windup` — a rival, not vermin, and the
difficulty step where a trinket stops being optional.

**The cellar** — beetle swarm (`plain`, many small hits), blind mole (`flee`,
hard to pin), cave cricket (`windup`). Boss: **the thing behind the boiler**.

## New gear

Each boss drops a trinket that is plainly better than the last, so clearing a
zone changes how the next one plays rather than only adding a number:

| item | from | effect |
|---|---|---|
| crow feather | magpie | +2 damage on every attack |
| torn collar | old tomcat | the first hit lands 2 softer |
| boiler bolt | the thing behind the boiler | +5 max HP |

Plus one consumable per zone so deeper hunting restocks better: garden herb
(restore 8), rusty nail (throw: 6 damage), ember scrap (+2 damage for 3 turns,
same as catnip but drops deeper).

No new item *kinds* and no new effect fields — the six existing fields cover
all of it. A zone that needed a new mechanic to be interesting would be a sign
the mechanic was missing, not that the zone was.

## Architecture

No new files and no new interfaces. `enemies.ts`, `zones.ts`, `items.ts` and
`loot.ts` gain entries; `QuestPanel` renders locked zones; `useQuest` exposes
all zones alongside the unlocked ones.

```ts
// useQuest, added:
zones: { zone: Zone; unlocked: boolean }[]
```

`unlockedZones` stays, since `startFight` and the tests use it, and the new
list is derived rather than replacing it.

## Testing

- `zones.ts`: unlock levels ascend; every roster references real enemies; every
  zone has a boss distinct from its regulars.
- `enemies.ts`: the existing structural tests already cover art shape, ASCII,
  and sane stats — they run over `ENEMIES`, so new entries are checked for free.
  Added: enemy strength ascends by zone, so a later zone is genuinely harder.
- `loot.ts`: every new enemy has a table; each boss drops its trinket.
- `balance.test.ts`: each zone's boss is a wall at its unlock level and
  beatable a few levels above it — the shape that makes a ladder rather than a
  cliff or a formality.
- `QuestPanel`: locked zones are listed, labelled with their level, and cannot
  be entered.

## Deliberate limits

- **No new behaviour type.** Three reads is enough; a fourth needs its own
  tell, art language and balance pass.
- **No zone-specific mechanics** — no darkness, no weather. One combat system.
- **Bosses do not repeat as regulars.** Clearing a zone leaves it open with its
  ordinary roster, which is already the rule from slice 1.
