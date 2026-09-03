# Daily trick training — design

Replaces `[PLAY]` (currently `NudgePicker`) with a daily trick-teaching
ritual that works entirely offline.

## Why

`[PLAY]` opens a picker of canned lines and sends the chosen one to the other
device. There is no relay deployed and none planned for now, so `send()` is a
no-op: pressing `[PLAY]` walks you through a menu to send a note to nobody,
then applies a flat stat reward. It is a menu with no destination.

The goal it has to serve instead: **give Биляна a reason to open the app
tomorrow.** That is a different problem from the one the nudge solved (feeling
like you are caring for the cat *together*), and it has to be solved without a
server.

## Shape

Teaching the cat tricks, one lesson a day, over weeks.

Three properties make it work as a daily habit:

1. **Scarcity** — one lesson per calendar day. The ritual is the limit.
2. **Agency without solvability** — her mood for the day plus the approach you
   pick shift the *odds*, they do not determine the result. You can play well
   without the game becoming a lookup table.
3. **No dead screen** — once the lesson is spent, the panel becomes a place to
   ask her to perform what she already knows, unlimited. Opening the app a
   second time is never a wasted trip.

The comedy is load-bearing. A cat that ignores you is funnier than a cat that
obeys, so the failure lines get the best writing and progress means failing
less often, not never.

## The daily lesson

```
DAY 6  —  Mia is restless.

  > offer a treat
  > wait quietly
  > wave the string first

  The string wore her out just enough.
  She sat. Then immediately stood up. But she sat.
                                      ████████░░  6/8
```

**Mood** is derived from the calendar date, so reopening the app shows the same
mood. It is unrelated to `deriveMood()` in `usePet.ts`, which reflects current
stats and changes minute to minute — the type is named `LessonMood` to keep
that separation obvious.

**Approach** is one of three, always the same three: `treat`, `patience`,
`play`.

**Outcome** is rolled from weights chosen by (mood, approach):

| weighting | learned (+2) | almost (+1) | nothing (0) |
|---|---|---|---|
| best | 55% | 35% | 10% |
| ok | 25% | 45% | 30% |
| poor | 10% | 35% | 55% |

Each mood has exactly one best, one ok and one poor approach, and each approach
is best for exactly two moods, so no single approach is globally correct:

| mood | best | ok | poor |
|---|---|---|---|
| restless | play | treat | patience |
| sleepy | patience | treat | play |
| curious | patience | play | treat |
| aloof | treat | patience | play |
| playful | play | treat | patience |
| hungry | treat | play | patience |

A trick costs 8 points. Playing well averages ~1.45 points a day (≈6 days per
trick); playing badly averages ~0.55 (≈15 days). With ten tricks that is on the
order of two months of daily ritual, and the spread means the choice visibly
matters without a bad day feeling punitive.

## What she already knows

After the lesson — and always, once at least one trick is learned — the panel
lists her tricks. Tapping one asks her to perform it: usually she does, sometimes
she refuses, always with a line and the cat's existing reaction glyph.

Performing is unlimited and **changes no stats**. It is an expressive toy, not a
second stat faucet; making it rewarding would turn a delight into a chore to
optimise.

Learned tricks also join the ambient idle flavour pool, so she occasionally
performs one unprompted — the payoff shows up even when nobody asked.

## Content

Writing is the bulk of the work. Structured to get variety without a
6 × 3 × 3 = 54-bucket matrix:

- `MOOD_INTRO[mood]` — 3 lines each (18) — sets the scene.
- `APPROACH_OUTCOME[approach][outcome]` — 3 × 3 × 3 lines (27) — what happened.
  The trick name is interpolated where it reads naturally, so "Halfway to a
  *high five*, then she reconsiders" stays specific without a full matrix.
- Per trick: success and refusal lines for performances.

## Files

| file | role |
|---|---|
| `src/data/tricks.ts` | the curriculum: id, name, cue, success/refusal lines |
| `src/data/lessons.ts` | moods, approaches, the odds table, all lesson prose |
| `src/hooks/useTricks.ts` | progress + "has today's lesson been used", persisted |
| `src/components/TrickPanel.tsx` | the panel, replacing `NudgePicker` in the same slot |
| `src/components/TrickPanel.css` | its styles |

Removed: `src/components/NudgePicker.tsx`, `.css`, `.test.tsx`, `src/data/nudges.ts`.

Kept deliberately: `useMessages.send()`. It has no caller once the nudge is
gone, but it is fully tested and is exactly what a relay deployment would need
on day one. Receiving, history and `sender.html` all still use the rest of the
hook.

## State

New localStorage key `catmagochi-tricks-v1`, separate from `PetSave`:

```ts
interface TrickSave {
  currentTrickId: string | null  // null once every trick is learned
  progress: number               // points toward the current trick
  learned: string[]              // trick ids, in the order learned
  lastLessonDay: string | null   // 'YYYY-MM-DD', local calendar day
}
```

Kept out of `PetSave` on purpose. `PetSave` syncs as care events between
devices; trick progress is a single-player ritual and putting it in the synced
save would mean designing a merge strategy for something that does not need
one. It follows the same defaults-merge load pattern `usePet.loadSave()` uses,
and the same shape validation added in the last branch.

"A new day" is the local calendar date, not a 24-hour timer: `lastLessonDay`
stores `YYYY-MM-DD`. A timer would drift later every day and eventually put the
ritual in the middle of the night.

## Integration

- The lesson fires the existing `playGame()` → `play` care event, once a day.
  Stats and growth deltas are untouched, and if a relay is ever deployed the
  lesson syncs with no extra work. Play is not a growth bottleneck (feed and
  clean are unlimited), so rationing it does not slow the cat down.
- `App.tsx` swaps `TrickPanel` in where `NudgePicker` was: same slot, same
  render priority (`TrickPanel` > `MessageView` > `AsciiCat`), same
  `actionsDisabled` behaviour.
- Performing a trick calls `triggerCue('play')` for the existing glyph.
- `useFlavorText(mood, extraLines?)` gains an optional pool so learned tricks
  can surface in the ambient caption loop.

## Testing

- `useTricks`: day gating across a date change, progress accumulation, learning
  a trick, advancing to the next, the all-learned end state, a corrupt or
  partial save, and localStorage that throws.
- `lessons.ts`: the odds table is complete (every mood × approach resolves) and
  balanced (each approach is best for exactly two moods); mood derivation is
  stable for a given date and varies across dates.
- `TrickPanel`: lesson view renders the day's mood and three approaches;
  picking one shows an outcome and updates progress; the panel switches to the
  show-off view once the lesson is spent; performing a trick renders a line.
- `App`: `[PLAY]` opens the panel, a lesson fires exactly one `play` care event,
  and the panel closes.

Randomness is stubbed (`Math.random`) and the date is fixed with fake timers —
both already the house pattern.

## Alternatives considered

- **Daily gift the cat brings back** (an ASCII trinket, building a collection).
  Fits the art constraints best and has the strongest "what did she bring
  today?" pull. Not chosen: it is a collection, not a relationship — the cat is
  a delivery mechanism rather than the point.
- **One small game a day, rotating.** Rejected once already for this app: a
  reflex mini-game read as "mindlessly pressing buttons", and a rotating set
  multiplies that by the number of games.
- **Daily vignettes you react to.** Warm, but purely narrative — nothing
  accumulates, so day 30 looks exactly like day 1.
- **Fixed mood → approach mapping** (a puzzle to solve rather than odds to
  shift). Satisfying for two weeks, then a lookup table.
- **Unlimited practice.** Progress arrives faster but the daily anchor — the
  entire point — disappears, and the content is exhausted in one evening.

## Deliberate limits

- **The cat's art does not change.** It is embedded verbatim and only the eyes
  animate. Tricks are conveyed the way mood already is: through the floating
  caption and glyph, never the cat's face. This is the established pattern in
  this app, not a workaround for it.
- **Ten tricks is finite.** After roughly two months the daily lesson ends and
  the panel becomes performances only. That is an honest ending rather than
  filler, and more tricks are a one-line addition to `tricks.ts`.
- **Stats do not influence the lesson.** A genuinely hungry cat taking the
  treat approach better would be a nice touch; it also couples the ritual to
  a value that changes every five seconds. Noted below instead.

## Possible improvements, out of scope

- Current stats nudging the odds (hungry → `treat` works better).
- A streak counter, and a gentle line when a day is missed.
- Trick performances that chain ("sit" then "shake paw").
- Syncing learned tricks when a relay exists, so the other person sees
  "Mia learned to high five today".
- A trick list in `StatsWindow` alongside the lifetime counters.
