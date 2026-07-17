# UX Audit Fixes — Design

Follow-up to `plan.md`'s 17-scenario walkthrough (PR #13, not yet merged). Addresses all 8 consolidated findings except the iOS install-guidance item, which is explicitly out of scope (see below). Brainstormed and approved in three clusters; this doc is the single combined record of what was agreed.

## Explicitly out of scope

**iOS "Add to Home Screen" guidance (plan.md finding #6).** Dropped — no iPhone users in the family this app is for. Not implemented, not tracked as a future item.

---

## 1. Decay pacing

**Problem:** `usePet.ts`'s `AWAKE_DECAY`/`SLEEP_RATE` bottom out every stat within roughly 40-80 minutes of the last touch, including through sleep, which doesn't match the app's actual use pattern (a few check-ins spread across a work day).

**Change:** scale the two rate constants down. All other stat math (`applyElapsed`, the 12-hour catch-up cap, `deriveMood`'s thresholds/priority, every action's flat deltas) stays untouched — this is a constants-only change.

| Constant | Current (per min) | New (per min) |
|---|---|---|
| `AWAKE_DECAY.fullness` | -2 | -0.3 |
| `AWAKE_DECAY.happiness` | -1.5 | -0.2 |
| `AWAKE_DECAY.energy` | -1 | -0.15 |
| `AWAKE_DECAY.cleanliness` | -1 | -0.15 |
| `SLEEP_RATE.fullness` | -0.5 | -0.1 |
| `SLEEP_RATE.happiness` | 0 | 0 (unchanged) |
| `SLEEP_RATE.energy` | +4 | +4 (unchanged) |
| `SLEEP_RATE.cleanliness` | -0.3 | -0.05 |

**Verification math:** from a full feed (fullness 100) + 8 hours asleep, fullness lands at 100 − 0.1×480 = 52 (was 0). From the 80 baseline, awake, fullness crosses the 25 "hungry" threshold at (80−25)/0.3 ≈ 183 min (~3h); happiness at (80−25)/0.2 ≈ 275 min (~4.6h); energy/cleanliness at (80−25)/0.15 ≈ 367 min (~6.1h) — fullness still decays fastest (preserves `deriveMood`'s priority order), but the whole spread now lands in the 3-6 hour range the audit targeted, instead of under 90 minutes for everything.

**Known test impact:** `usePet.test.ts` has several tests that hardcode expected stat values after N minutes elapsed (e.g. "catches up stats for elapsed time since lastUpdate on load, awake decay"), computed against the *old* rates. These need their expected numbers recalculated against the new rates — this is an intentional consequence of the change, not a regression to chase down. The 12-hour-cap test should still pass unmodified (720 min at any of the new rates still clamps every stat to its floor).

---

## 2. Nudge send-feedback + 3. offline retry (combined)

**Problem:** `NudgePicker` → `handleSendNudge` → `useMessages.send()` is fire-and-forget with no return value, so the sender has no idea whether a nudge actually reached the relay, whether it's queued, or whether there's no relay configured at all. Compounding this, a send attempted with no network connectivity is lost outright — there's no retry, unlike the outbox already built for care events.

**Change:** give `useMessages.send()` an outbox (mirroring `useCareEvents.ts`'s existing pattern) and a real return value, then surface that outcome as a transient caption.

### Server: `POST /send` accepts an optional client-generated `id`

Currently the server always generates the message id itself (`randomUUID()`). To make outbox retries safe against duplicate delivery — if a retried send actually succeeded server-side the first time but the client never got a clean response, a second attempt must not become a second message on the receiving device — the id needs to be stable across retries, the same fix already used for care events.

`server/server.js`'s `/send` handler: if the request body includes a non-empty string `id`, use it as the message's id instead of generating one; otherwise fall back to `randomUUID()` as today. This keeps `sender.html` (which won't be updated to send an id) working unchanged, and the *receiving* client's existing id-based dedup (`useMessages.ts`'s `ws.onmessage`: `current.some((m) => m.id === id)`) then correctly collapses a retried duplicate into a no-op.

### Client: `useMessages.ts`

- New `localStorage`-backed outbox, `catmagochi-message-outbox-v1`, same shape/lifecycle as `useCareEvents.ts`'s `catmagochi-care-outbox-v1`: entries are `{ id, text, kind }`, generated with `crypto.randomUUID()` client-side.
- `send(text, kind?)` becomes `async` and returns `Promise<'sent' | 'queued' | 'unconfigured'>`:
  - Returns `'unconfigured'` immediately (no outbox entry created) if `HTTP_RELAY_URL`/`RELAY_TOKEN` aren't set — matches every other feature's "no-op without the relay" behavior.
  - Otherwise queues the entry, attempts the POST inline. On success: removes the entry, returns `'sent'`. On failure: leaves the entry queued, returns `'queued'`.
  - A background `flush()` (same shape as `useCareEvents.ts`'s) retries whatever's left in the outbox, triggered on the WebSocket's `onopen` (mirroring `useCareEvents.ts`'s `ws.onopen = () => { reconnectDelay.current = RECONNECT_MIN_MS; flush() }`) — so a nudge queued from a dead-zone sends itself once the connection actually comes back, without the sender needing to do anything.

### Client: `App.tsx`

- `handleSendNudge` becomes `async`, awaits `send(text, 'nudge')`, and shows a short transient caption based on the result:
  - `'sent'` → "Sent."
  - `'queued'` → "Saved — will send when back online."
  - `'unconfigured'` → nothing shown (this is the normal, silent, standalone-mode path — showing a "no connection" message here would nag a genuinely solo user forever, since relay configuration is a build-time constant, not something that changes moment to moment).
- New small self-contained caption mechanism (not routed through the existing `captionPop`/mood-caption system, since that one always prefixes the pet's name — "Mochi Sent." would read wrong for an operation status, not a cat reaction). Reuses the `.floating-caption` CSS class/animation directly: its own `useState<{ text: string; key: number } | null>`, a `setTimeout`-based auto-clear (~2.5s, matching `ACTION_FLAVOR_MS`), same random-position logic as the existing caption pop for visual consistency.

---

## 4. PLAY discoverability

**Problem:** `[PLAY]` no longer plays a game; a first-time tap after the nudge redesign won't do what the label implies, and the label itself stays `[PLAY]` per the earlier explicit decision not to rename it.

**Change:** a one-time explainer line inside `NudgePicker` itself, self-contained (no new prop from `App.tsx` — this is purely `NudgePicker`'s own first-use state, keeping the component well-bounded). Tracked via `localStorage` flag `catmagochi-nudge-intro-seen-v1`. On first mount, if the flag isn't set, render an extra line above the options — something like "Send a quick note instead of a game." The flag is set the moment the picker closes for the first time, whichever way it closes (pick a phrase, or cancel), so it never shows a second time regardless of how the user exits.

---

## 5. Notification onboarding prompt

**Problem:** `notificationSettings.global` correctly defaults to opt-in-off, but nothing in the app ever points at the Settings toggle or explains why you'd want it — the only path to enabling it is incidentally finding `[MENU]` → Settings.

**Change:** a one-time, dismissible banner on the main game screen, inline in `App.tsx` near `.grow-banner` (consistent with that existing pattern — no new component needed for something this small). Shown when a `localStorage` flag `catmagochi-notification-prompt-seen-v1` is unset **and** `notificationSettings.global` is still `false` (so it never reappears once notifications are on, and never shows again after being dismissed either way). Content: "Turn on notifications to hear from [pet's name] even when the app's closed" with two actions:
- `[ ENABLE ]` — calls `onUpdateNotificationSettings({ global: true })` (triggering the existing push-subscription flow) and sets the seen-flag.
- `[ NOT NOW ]` — just sets the seen-flag, no settings change.

Shows on first render after adoption (the earliest point it's relevant) — no separate staging needed against the grow-banner, since that one only appears on an actual stage transition, which can't happen at growth 0.

---

## 6. `CLAUDE.md` doc fix

**Problem:** the `asciiCat.ts` bullet describes an "analytic geometry... supersampling" renderer with per-stage `DIMS` and per-mood mouth stamps. The actual current file is a single verbatim braille-art image (explicitly commented "embedded VERBATIM — do not regenerate"), scaled by CSS `font-size` per stage class, with `buildFrame` only ever branching on open-eyes vs. closed-eyes (blink or sleeping) — no per-stage art, no per-mood face at all.

**Change:** rewrite that bullet to describe the actual current implementation — the `BASE` braille array, the eye-row character-surgery approach (`openEyes`/`closedEyes`, `LEFT_PUPIL`/`RIGHT_PUPIL`, the idle pupil-offset frames), the CSS-only stage scaling (`.cat-sprite.stage-kitten/young/adult`), and the fact that mood only ever affects whether the eyes are open or closed — no mouth/face variation per mood. Pure documentation, no behavior change.

---

## 7. StartScreen skip-after-first-open

**Problem:** the boot splash (`START_DISPLAY_MS` 900ms + `START_FADE_MS` 300ms = 1.2s) plays on every single open, including "just glance for a second" and "opened from a notification, show me now" — the two scenarios where it's purely friction, not delight.

**Change:** `localStorage` flag `catmagochi-start-seen-v1`. In `App.tsx`, `showStart`'s `useState` initializer checks this flag instead of always starting `true` — `useState(() => !localStorage.getItem('catmagochi-start-seen-v1'))`. The flag is set inside the existing `onDone={() => setShowStart(false)}` callback the first time `StartScreen` actually completes (not on skip, so a skipped run doesn't need to touch it at all). `StartScreen` itself stays exactly as it is — a pure, stateless timing component; the persistence lives in `App.tsx`, which already owns `showStart`.

---

## Testing plan (by finding)

- **Decay pacing:** update `usePet.test.ts`'s hardcoded elapsed-time assertions to the new rate constants; the 12-hour-cap test needs no change.
- **Nudge feedback + retry:** new `useMessages.test.ts` tests mirroring `useCareEvents.test.ts`'s existing outbox suite (posts immediately and clears on success / keeps a failed send queued / retries on reconnect / loads a persisted outbox) plus `send()`'s three-way return value; a `server/server.test.js` test that a client-supplied `id` on `POST /send` is honored and that omitting it still falls back to server-generation; `App.test.tsx` tests for the new send-status caption appearing for `'sent'`/`'queued'` and staying silent for `'unconfigured'`.
- **PLAY discoverability:** `NudgePicker.test.tsx` tests for the intro line showing on first mount (no flag set) and not showing once the flag is set, and that closing the picker either way sets the flag.
- **Notification prompt:** `App.test.tsx` tests for the banner appearing when unset+disabled, not appearing once enabled or once dismissed, and both `[ ENABLE ]`/`[ NOT NOW ]` setting the seen-flag.
- **CLAUDE.md fix:** no tests — documentation only.
- **StartScreen skip:** `App.test.tsx` tests that a fresh `localStorage` shows the splash and a pre-set flag skips straight to the game/name screen; `StartScreen.test.tsx` itself needs no change (it stays flag-unaware).

---

*Spec self-review: no placeholders/TBDs: confirmed. Internal consistency: the send-feedback design (§2/3) depends on the server change landing in the same body of work — noted explicitly rather than left implicit. Scope: eight independent findings, appropriately batched per explicit user choice ("all 8 findings") rather than split into eight separate specs — each still has clearly separable file-level boundaries so the implementation plan can task them independently. Ambiguity: none identified — every finding above has one concrete mechanism, not a menu of options.*
