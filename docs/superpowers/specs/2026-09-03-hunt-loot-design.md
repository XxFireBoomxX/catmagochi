# Loot and inventory — the hunt, slice 2

Enemies drop things. You carry them, eat them mid-fight, and wear them.

Slice 1 (`2026-09-03-hunt-rpg-design.md`) shipped combat, skills, one zone and
levels. It gave the cat a reason to fight and nothing to fight *for*: winning
paid XP and that was all. This adds the payoff.

## What drops

Every enemy carries a small drop table. A fight that ends in a win rolls it;
a flee pays half XP and no loot, since the enemy left with its pockets.

Drops are deliberately sparse — roughly one fight in two yields anything, and
the boss always yields. A guaranteed trinket every fight makes the inventory a
chore to read rather than a thing to check.

## Two kinds of item

**Consumables** are used inside a fight, from the move list, and are gone
afterwards. They occupy the same decision space as skills — spending a turn on
a fish scrap is a turn not spent attacking — so they extend the existing
tension rather than bypassing it.

| item | drops from | effect |
|---|---|---|
| fish scrap | beetle, mouse | restore 4 HP |
| bottle cap | beetle | throw it: 3 damage, no cooldown |
| catnip leaf | grasshopper, mouse | +2 damage for 3 turns, like sharpen claws |

**Trinkets** are worn. One at a time, chosen on the hunting grounds, and they
change the numbers a fight starts with rather than what you do during it.

| item | drops from | effect |
|---|---|---|
| bent whisker | mouse | +2 max HP |
| beetle shell | beetle | the first hit each fight deals 1 less |
| rat tooth | pantry rat (boss) | +1 damage on every attack |

Three of each is the whole roster for this slice. A larger table is a data
change, not a design change, once the machinery exists.

## Inventory

A counted bag: `Record<itemId, number>`, capped per item so a long grind cannot
produce a screen full of "fish scrap x 4127". The cap is 9, which is more than
any fight needs and keeps every count one character wide.

The hunting grounds gain a third option beside the zones: `bag`, listing what
you carry and which trinket is worn. Consumables appear in the fight's move
list automatically when you hold one.

## What this does not do

- **No equipment on the cat's sprite.** That is slice 3, and it is the slice
  that touches the cat's appearance. Trinkets here are numbers and a line of
  text, nothing visual.
- **No selling, crafting, or rarity tiers.** A cat does not run a shop.
- **No inventory management pressure.** The bag never fills up and nothing is
  ever lost; the per-item cap is a display concern, not a difficulty one.

## Architecture

Slice 1's boundary holds: the rules stay in pure functions, `QuestPanel` only
renders and hands `Math.random` in.

| file | role |
|---|---|
| `src/data/items.ts` | the six items, their kind, their effect, their text |
| `src/data/loot.ts` | drop tables and `rollLoot(enemyId, roll)` |
| `src/data/combat.ts` | extended: `useItem` as a turn, trinket effects at `startCombat` |
| `src/hooks/useQuest.ts` | extended: `bag`, `worn`, `addLoot`, `consume`, `wear` |
| `src/components/QuestPanel.tsx` | extended: a `bag` view, consumables in the move list |

### Items

```ts
type ItemKind = 'consumable' | 'trinket'

interface Item {
  id: string
  name: string
  kind: ItemKind
  hint: string                 // shown in the bag and the move list
  heal?: number                // consumable: restore HP
  damage?: [number, number]    // consumable: deal damage
  sharpen?: boolean            // consumable: apply the sharpen buff
  bonusMaxHp?: number          // trinket: added at startCombat
  bonusDamage?: number         // trinket: added to every attack
  softensFirstHit?: number     // trinket: reduces the first incoming hit
}
```

One flat shape with optional fields rather than a discriminated union per
effect: there are six items, the fields do not interact, and a union would
mean three types and a narrowing function to save nothing.

### Combat

`startCombat(enemyId, catMaxHp, trinket?)` folds `bonusMaxHp` into starting
health and remembers `bonusDamage` and `softensFirstHit` on the state.
`takeTurn(state, actionId, rng)` accepts an item id as well as a skill id —
items are turns, so they route through the same function and the same "is this
legal" check. An item the cat does not hold is refused exactly like a skill on
cooldown: the state comes back unchanged.

`CombatState` gains `bonusDamage`, `firstHitSoftener`, and `used: string[]` so
the panel knows what to remove from the bag when the fight ends. Consumables
are spent from the bag on the way *out* of a fight rather than when used, so
quitting mid-fight cannot duplicate an item.

### Storage

`QuestSave` gains `bag: Record<string, number>` and `worn: string | null`,
loaded through the same clamp-and-filter the existing fields use: unknown item
ids are dropped, counts are clamped to `0..ITEM_CAP`, and a `worn` id that is
not a trinket becomes `null`.

## Testing

- `loot.ts`: every table references real items; `rollLoot` spans its table
  across the roll range; the boss always drops; nothing drops for a flee.
- `combat.ts`: an item is a turn (the enemy acts after it); a healing item
  never exceeds max HP; a thrown item damages; an item not held is refused
  without spending the turn; a used item is recorded once in `used`; trinket
  bonuses apply exactly once each — `bonusMaxHp` at the start, `bonusDamage`
  on every hit, `softensFirstHit` on the first incoming hit only.
- `useQuest.ts`: loot adds and caps; consuming decrements and cannot go
  negative; wearing swaps; wearing a consumable is refused; a corrupt bag is
  cleaned rather than trusted.
- `QuestPanel`: the bag view lists what is carried; a held consumable appears
  in the move list and disappears when the last one is used; the worn trinket
  shows on the grounds.
- `balance.test.ts`: the existing curve still holds with no trinket, and a
  worn `rat tooth` measurably improves it — a trinket that changes nothing is
  a bug the numbers should catch.

## Deliberate limits

- **The per-item cap is 9.** Not a difficulty mechanic. It exists so counts
  stay one character wide and a long grind does not turn the bag into noise.
- **One trinket at a time.** Two slots would need a whole comparison UI in a
  panel that is already three views deep on a phone screen.
- **Consumables are spent on fight exit, not on use.** The alternative loses an
  item if the app is closed mid-fight, which is worse than the alternative of
  keeping one you already spent.
