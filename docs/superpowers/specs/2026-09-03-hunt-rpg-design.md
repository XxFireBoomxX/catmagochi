# The hunt — a turn-based RPG behind [PLAY]

Slice 1 of four. Replaces daily trick training with a real game: turn-based
combat, enemies with distinct behaviour, XP, levels, and skills that unlock as
the cat grows into a hunter.

## Why, and why again

`[PLAY]` has had four answers now. A reflex mini-game (cut for feeling like
button-mashing), a nudge sent to the other device (cut because the relay was
never deployed, so it sent to nobody), a daily trick lesson (shipped in
v1.0.10), and now this. The brief changed: not "a small daily ritual" but a
game with skills, levels, loot and a cat that visibly changes — an RPG.

Trick training is removed rather than kept alongside. Two half-games behind one
button is worse than one whole one.

## Scope: this is slice 1 of four

Combat, progression, inventory, equipment and the cat's appearance are five
subsystems. Building them as one change would produce a plan nobody can execute
and nothing playable until the end. They ship in order, each playable on its own:

| slice | contents | ships |
|---|---|---|
| **1 (this spec)** | turn-based combat, 5 skills, one zone, 3 enemies + a boss, XP/levels | a complete game |
| 2 | loot drops, inventory, consumables, equipment stats | a reason to fight |
| 3 | equipment drawn on the cat, palette by level | the visible RPG |
| 4 | garden, shed, cellar — enemies and a boss each | depth |

Slices 2-4 are deliberately *not* designed here. Build 1, play it, then decide.

## Combat

```
MIA   lvl 3   ██████░░░░  120/200 xp

      /\_/\    HOUSE MOUSE
     ( o.o )   HP ████░░░░░░  4/10
      > ^ <    it is edging toward the wall

      MIA      HP ████████░░  8/10
               claws sharp (2 turns)

  > swipe             2-4 dmg
  > pounce            5-7 dmg, 2 turn cooldown
  > sharpen claws     +2 dmg for 3 turns
  > flatten ears      block the next hit
```

You and the enemy alternate turns. Every skill has a cost, so the choice is a
real one rather than "press the biggest number":

| skill | unlocks | effect |
|---|---|---|
| swipe | level 1 | 2-4 damage, no cooldown |
| pounce | level 2 | 5-7 damage, 2-turn cooldown |
| sharpen claws | level 4 | no damage; +2 damage for 3 turns |
| flatten ears | level 6 | no damage; negates the next enemy hit |
| hiss | level 8 | no damage; enemy loses its next turn, 4-turn cooldown |

Damage-free skills spend a turn, so they only pay off when read correctly
against what the enemy is doing.

### Enemies behave differently

Behaviour is what makes the choice matter; without it every fight is the same
fight with different numbers.

| enemy | HP | damage | behaviour | XP |
|---|---|---|---|---|
| crumb beetle | 6 | 1-2 | attacks every turn | 10 |
| house mouse | 10 | 2-3 | flees below 30% HP — you get half XP | 18 |
| grasshopper | 12 | 0 then 5-7 | winds up one turn, then hits hard | 25 |
| pantry rat (boss) | 26 | 3-5 | winds up, and does not flee | 70 |

The grasshopper's wind-up is telegraphed in its tell line, so `flatten ears`
has an obvious right moment. The mouse rewards finishing fast over building up.

## Progression

- XP to reach the next level: `100 + (level - 1) * 50`.
- Cat max HP: `10 + (level - 1) * 2`.
- Levels unlock skills per the table above.
- A zone tracks encounters cleared. The kitchen is 8: seven random enemies,
  then the boss.

The progress bar shows level and XP. The zone list shows clears and what is
still locked.

## No limits, by choice

Fights cost nothing. HP restores fully between them; losing costs only that
fight's XP and gets a line about it. This was an explicit decision, and it
moves the pacing burden onto content depth — there is no rationing to stretch
a thin game, so the enemies have to carry it. That is why behaviour is a
first-class part of the enemy table rather than a nice-to-have.

**Pet stats are untouched by fighting**, with one exception: the first victory
of each calendar day fires the existing `playGame()` care event. That keeps
`totalPlays` and the `play` care event meaningful (and syncing, if a relay ever
appears) without turning unlimited combat into an unlimited stat faucet.

## Architecture

The combat engine is pure and lives apart from React. Randomness enters as an
injected `rng: () => number`, never `Math.random()` inside — so a fight can be
replayed exactly in a test.

| file | role |
|---|---|
| `src/data/skills.ts` | the five skills, their costs and unlock levels |
| `src/data/enemies.ts` | enemy stats, ASCII art, tells, behaviour tags |
| `src/data/zones.ts` | the kitchen: encounter table, length, boss |
| `src/data/combat.ts` | `startCombat`, `takeTurn` — pure, no React, no globals |
| `src/data/progression.ts` | `xpToNext`, `maxHpForLevel`, `skillsForLevel`, `applyXp` |
| `src/hooks/useQuest.ts` | persisted level/xp/clears; `catmagochi-quest-v1` |
| `src/components/QuestPanel.tsx` + `.css` | zones / fight / result views |

`combat.ts` knowing nothing about React or storage is the point: it is where
every rule lives, and it can be exercised directly.

### State

```ts
interface QuestSave {
  level: number
  xp: number                          // toward the next level
  zoneClears: Record<string, number>  // zoneId -> encounters won
  lastPlayDay: string | null          // 'YYYY-MM-DD', gates the daily care event
}
```

Its own key, not `PetSave` — `PetSave` syncs as a care-event log between
devices, and a single-player campaign has no merge story. Loaded through the
same shape validation `usePet.loadSave()` uses, with `level`, `xp` and each
clear count clamped to sane values rather than trusted.

```ts
interface CombatState {
  enemyId: string
  enemyHp: number
  catHp: number
  catMaxHp: number
  sharpenTurns: number      // +2 damage while > 0
  guarding: boolean         // negates the next enemy hit
  enemyStunTurns: number
  enemyWindingUp: boolean
  cooldowns: Record<string, number>
  log: string[]
  outcome: 'ongoing' | 'won' | 'lost' | 'fled'
}
```

## Removed

`src/data/tricks.ts`, `src/data/lessons.ts`, `src/hooks/useTricks.ts`,
`src/components/TrickPanel.tsx` and their tests and CSS. The
`catmagochi-tricks-v1` key is left in place rather than migrated — there is
nothing to carry over into a combat system, and deleting a user's key on
upgrade is worse than leaving a few bytes behind.

`useFlavorText(mood, extra?)` keeps its optional pool, now fed hunting-flavoured
idle lines once the cat has a level or two, rather than learned tricks.

## Testing

- `combat.ts` carries the bulk. With an injected `rng` a fight is deterministic:
  damage ranges respect their bounds, cooldowns block and expire, `sharpen`
  adds exactly +2 for exactly 3 turns, `guard` negates exactly one hit, a
  stunned enemy misses exactly one turn, the mouse flees below the threshold
  and only below it, the grasshopper alternates wind-up and strike, and HP
  never goes negative in the state the UI reads.
- `progression.ts`: the XP curve, level-ups (including a single XP award that
  crosses two levels), and which skills are available at which level.
- `useQuest.ts`: persistence, clamping a corrupt save, the daily care-event
  gate firing once and not twice, zone unlocks.
- `QuestPanel`: the zone list reflects clears and locks; picking a fight
  renders the enemy; a skill button is disabled while on cooldown; a win
  advances the zone counter; a loss offers a retry.
- `App`: `[PLAY]` opens the panel; the first win of the day emits exactly one
  `play` care event and a second win the same day emits none.

## Alternatives considered

- **Tricks become combat skills.** Would have preserved the daily ritual and
  given it a purpose. Rejected in favour of a clean skill tree.
- **Energy gates fighting**, tying the game to feeding and sleeping. The most
  elegant integration on offer, and rejected deliberately: a bad run in the
  game should not punish the cat.
- **Send-and-wait hunts** resolving over real time. Fits a daily rhythm and the
  fixed art better, but it is a report to read, not a game to play.
- **Endless scaling waves** instead of authored zones. Near-infinite content
  for almost no writing, and samey within an hour — especially with no daily
  limit to slow it down.

## Deliberate limits

- **The cat's art does not change in this slice.** It is embedded verbatim and
  only the eyes animate. Slice 3 makes the cat visibly change by drawing
  equipment around the base art and shifting the palette by level — the
  reference art itself stays untouched.
- **Enemy art is small, plain ASCII** (three lines), not braille. It has to
  read at a glance next to a much larger cat and sit inside the existing panel.
- **One zone.** Four zones of enemies before anything is playable is the wrong
  order to build in.
