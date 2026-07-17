# Catmagochi UX Walkthrough Plan

> Adapted from the `superpowers` plugin's `writing-plans` process (real plugin, but its exact skill wasn't registered as invocable mid-session — I read the skill files directly from `~/.claude/plugins/cache/claude-plugins-official/superpowers/6.1.1/skills/` and followed them by hand: bite-sized checklist tasks, self-review, "go by it" = execute each task and record what actually happens). This isn't a TDD implementation plan — the deliverable is a usability walkthrough, so each "task" below is a lived scenario, not a code change.

**Goal:** Walk through the app the way its two actual users will actually use it — short, scattered check-ins across a work day, plus the handful of "special moment" and "something broke" scenarios — and catch anything that would feel bad, confusing, or missed in practice, before the recipient of this gift ever hits it.

**Method — and its limit, stated up front:** There's no headless browser available in this sandbox (Playwright's cached Chromium is present but missing system shared libraries — `libnspr4.so` etc. — and there's no sudo to install them; confirmed by trying). So this isn't a click-through with screenshots. Every scenario below is walked through by tracing the actual code paths — `usePet.ts`'s decay math, the exact JSX each state renders, the actual CSS — and reasoning through what a real person would see and feel at each step. That's a real limitation for genuinely visual questions (does this animation feel smooth, is this color contrast readable in sunlight); it's a real strength for anything about *pacing, state, and logic*, which turned out to be where most of what I found actually lives.

**How to read this document:** Each use case has a short story (matching the "I woke up today, opened the app..." framing), then what I checked, then findings. Findings are tagged so the important ones don't get lost in the routine ones:
- **[SIGNIFICANT]** — actually undermines the intended experience for real usage
- **[WORTH DOING]** — a real gap, lower stakes
- **[WORKS WELL]** — confirmed working as intended, noted so it doesn't get re-litigated later
- **[IDEA]** — not a problem, a possibility

---

## Use cases

- [x] 1. First adoption
- [x] 2. Morning check-in
- [x] 3. Midday check-in (the "lunch break" scenario)
- [x] 4. A 10-second glance, no interaction
- [x] 5. Evening wind-down + sleep
- [x] 6. Forgot to check in for a full day
- [x] 7. Sending a nudge to your partner mid-workday
- [x] 8. Receiving a nudge / message
- [x] 9. Both partners caring for the cat around the same time
- [x] 10. One partner has a spotty connection
- [x] 11. Turning on notifications
- [x] 12. Installing it as a home-screen app
- [x] 13. Watching the cat grow up
- [x] 14. Checking the stats window out of curiosity
- [x] 15. Checking for app updates
- [x] 16. Using it on a Raspberry Pi kiosk screen (future)
- [x] 17. The relay isn't deployed yet (current real state)

---

### 1. First adoption

**The story:** You've just installed the app (or opened the link for the first time). You're handed a blank "what should we name your new kitten?" screen.

**What I checked:** `App.tsx`'s `showStart` → `NameScreen` flow, `defaultSave()` in `usePet.ts`, `NameScreen`'s form.

**Findings:**
- [WORKS WELL] The name field trims and falls back to "Cat" on blank submit — can't get stuck or produce an empty-named pet.
- [WORKS WELL] Stats start at 80/80/80/80, not maxed at 100 — the cat needs *something* soon-ish but isn't already unhappy at minute one.
- [WORTH DOING] There's no explanation of what the four action buttons do or what the stat bars mean. For FEED/CLEAN/SLEEP this is fine — the genre is self-explanatory. **PLAY is not**, since it no longer means what it says (see #7) — a first-time user's first tap on it will not do what the label implies.
- [WORTH DOING] Nothing here hints that this is meant to be a *shared* pet, or that there's a Settings toggle to hear from the other person. Someone unfamiliar with the concept could easily use this for days as a solo app and never discover the point of it.

---

### 2. Morning check-in

**The story:** You wake up, and before getting out of bed you open the app to see the cat.

**What I checked:** `usePet.ts`'s `applyElapsed`, `AWAKE_DECAY`/`SLEEP_RATE`, `deriveMood`, and traced the actual numbers for a typical night.

**This is where I found the biggest issue in the whole audit.** Walking the math:

Decay rates are `AWAKE_DECAY = { fullness: -2, happiness: -1.5, energy: -1, cleanliness: -1 }` **per minute**, and `SLEEP_RATE = { fullness: -0.5, happiness: 0, energy: +4, cleanliness: -0.3 }` per minute, applied via elapsed real time on every load (capped at 12 simulated hours).

If you feed the cat before bed (fullness → 100) and toggle `[SLEEP]`, then check again 8 hours later:
- fullness: 100 − 0.5×480 = **0**, clamped
- cleanliness: 80 − 0.3×480 = **0**, clamped
- energy: 80 + 4×480, clamped to **100** (fine)
- happiness: unaffected by sleep, so wherever it was

And if you *don't* remember to toggle sleep (realistically: most nights), it's `AWAKE_DECAY` for all 8 hours instead — everything bottoms out even faster, including happiness.

**[SIGNIFICANT].** From a full feed, fullness alone reaches 0 in 40 minutes, and even from a max 100 (right after feeding) it's 50 minutes. Every stat is designed to hit its floor within roughly an hour of the last interaction — **including through sleep**, since sleep only softens fullness/cleanliness decay, it doesn't stop it. That means: every single morning, no matter what you did the night before, the cat will be at rock bottom on fullness and cleanliness, showing `hungry` mood (`deriveMood`'s priority is fullness > energy > cleanliness > happiness, so hungry wins). This isn't "the cat missed you" — it's the same forced low-stat state every day regardless of behavior, which starts to read as noise rather than a real signal. For an app whose stated use case is "check in a few times a day," the tuning currently assumes near-constant attention.

- [WORKS WELL] The *mechanism* itself is right — catch-up-on-load via real elapsed time, not a running background tick, is exactly correct for a PWA that isn't always open. This is a tuning problem, not an architecture problem.
- [WORTH DOING] The 12-hour catch-up cap (`Math.min(elapsedMs / 60_000, 12 * 60)` in `applyElapsed`) is currently dead weight — every stat already clamps to its floor/ceiling well under 2 hours, so nothing ever reaches the cap under present rates. Worth knowing if the rates change (see idea below) — the cap would start mattering again.

**[IDEA]:** Slow `AWAKE_DECAY` (and especially `SLEEP_RATE.fullness`/`cleanliness`) enough that a realistic "3-4 check-ins across a waking day" cadence keeps the cat mostly in `content`/`happy` territory, with `hungry`/`dirty` as a real signal for "you actually forgot," not the default resting state. Rough target: a stat shouldn't cross 25 in much less than 4-6 hours of no interaction.

---

### 3. Midday check-in (the "lunch break" scenario)

**The story:** You're at work. You go to eat at noon and pull out your phone to check on the cat for a minute.

**What I checked:** Same decay math as #2, plus the `[FEED]`/`[CLEAN]` button flow and pulse/glyph feedback (`App.tsx`'s `pulse`, `AsciiCat`'s `ACTION_EFFECT`).

**Findings:**
- [SIGNIFICANT] Same root cause as #2 — by noon, several hours after a morning check-in, the cat has been sitting at 0 fullness/cleanliness (and likely low happiness) since well before lunchtime. The "quick midday glance" the app is explicitly meant to support currently *always* finds a cat in crisis, which undercuts the emotional beat of "oh good, they're doing okay" that a lunch-break check-in should offer at least some of the time.
- [WORKS WELL] The actual feed/clean interaction itself is well-built once you're there: immediate stat jump, a floating glyph (`nom nom` / `*scrub*`), a stat-bar pulse-glow, and a ~25% chance of a bonus caption line (`smacks its lips`, etc.) — this is a satisfying, well-layered "juice" stack for a two-second interaction, exactly right for a lunch-break check-in's actual time budget.
- [WORKS WELL] Feeding a fully-decayed cat and watching it visibly recover (glyph, pulse, mood caption change) is itself a nice moment — the tuning issue in #2/#3 is about *how often* you arrive at that moment, not about the moment itself being bad.

---

### 4. A 10-second glance, no interaction

**The story:** You're in a meeting, phone under the table. You open the app just to look at the cat for a few seconds and put the phone away — no taps.

**What I checked:** `StartScreen` timing, idle animation loop (`gentle-bob`, pupil-wander), `useFlavorText`.

**Findings:**
- [WORTH DOING] `StartScreen` is a fixed, un-skippable 900ms display + 300ms fade = **1.2 seconds** before you see anything, on *every* open, including this one. For a "just glance for a second" use case, that's a meaningful fraction of the whole interaction being a boot animation you've already seen hundreds of times. It was a deliberate, reasonable choice earlier this session (standing in for the OS's own splash), but 1.2s fixed, every time, with no memory of "you've seen this" is worth reconsidering now that it's had time to sit.
- [WORKS WELL] Once past the splash, the cat is genuinely alive without any tap: `gentle-bob` CSS keyframe, wandering pupils, and `useFlavorText`'s periodic caption swap (`purrs contentedly`, `flicks tail`, etc. — see `FLAVOR_TEXT`/`GENERIC_FLAVOR`). A 10-second glance would very plausibly catch at least a blink and a caption change. This is exactly the kind of ambient life a "just look at it" use case needs, and it's there.
- [WORTH DOING] Minor: nothing on this screen tells you *when* someone last interacted with the shared cat (see idea in #9) — a glance-only user has no way to know "did my partner already check in today?" without opening the stats window and reading total counts, which don't carry timing either (only lifetime totals, not "last touched").

---

### 5. Evening wind-down + sleep

**The story:** Last check of the day before bed. You feed, maybe clean, and toggle `[SLEEP]`.

**What I checked:** `toggleSleep`, `actionsDisabled` logic, sleeping-cat rendering (`buildFrame`'s `closed` branch), `ACTION_EFFECT.sleep`/`.wake`.

**Findings:**
- [WORKS WELL] Sleep correctly disables FEED/PLAY/CLEAN (`actionsDisabled = sleeping || playPickerOpen || messages.length > 0`) and the sleeping cat gets its own rendering (closed-eye braille swap) plus a `zzz` glyph and flavor lines (`snores softly... zzz`). The state is visually unambiguous.
- [WORKS WELL] `[WAKE]` is always available even while sleeping (the one action allowed), so there's no dead-end.
- [WORTH DOING] As noted in #2, toggling sleep doesn't meaningfully change the "cat is at 0 by morning" outcome for fullness/cleanliness — so the ritual of "put the cat to bed" currently has close to no mechanical payoff beyond energy. That's a missed opportunity for the sleep toggle to feel *protective* the way it's framed (a cat resting is supposed to need less from you, not just less than it would need awake).

---

### 6. Forgot to check in for a full day

**The story:** A genuinely busy day — you don't open the app at all until the next evening, over 24 hours later.

**What I checked:** The 12-hour catch-up cap, `deriveMood` at floor values, `useAttentionNotifications`.

**Findings:**
- [WORKS WELL] The catch-up cap means this doesn't require special-casing or produce a broken/huge computation — stats just clamp at their floor, mood reads `hungry` (fullness loses first in the priority order), and one `feed()`/`clean()`/`pet()` cycle brings it back. No punishment beyond the honest state of things.
- [WORTH DOING] But per #2/#3, this scenario is *mechanically indistinguishable* from a normal 4-hour gap — both land at exactly the same "everything is 0" state. A real all-day miss and a routine lunch-to-evening gap currently feel identical, which is the same tuning issue expressed at a different timescale, and another reason to fix the decay pacing rather than treat this as its own problem.
- [WORKS WELL] `useAttentionNotifications` is explicitly local-only and documented as such (CLAUDE.md is honest about this being a permanent gap, not a bug) — so it's expected, not a surprise, that a fully-closed app gives zero warning during a missed day. No finding here beyond confirming the docs match the code.

---

### 7. Sending a nudge to your partner mid-workday

**The story:** Mid-afternoon, you think of your partner. You tap `[PLAY]` and send "Thinking of you."

**What I checked:** `App.tsx`'s `playPickerOpen` flow, `NudgePicker.tsx`, `handleSendNudge`, `useMessages.send`, and — critically — what happens end-to-end when the relay isn't reachable.

**Findings:**
- [WORKS WELL] The picker itself is well-executed: sentence-case, non-shouty phrasing distinct from the app's usual ALL-CAPS bracket buttons (a deliberate, good choice — these are meant to read as a note, not a command), a `[ CANCEL ]` escape hatch, and it correctly blocks other actions while open.
- **[SIGNIFICANT], and current.** Tapping a nudge option gives **zero indication of whether it actually sent anywhere.** `handleSendNudge` applies the local reward, fires `send(text, 'nudge')` (fire-and-forget, per `useMessages.ts`), and closes the picker — identically, whether the relay is fully configured and reachable, or entirely unset. There's no "sent" confirmation and no "couldn't reach them" indicator. Per #17 below, **the relay is not currently deployed** — meaning right now, every real nudge from the actual recipient of this app silently goes nowhere, with no way to know that from the UI. This is the single most important finding in this document, because it's the app's newest, most personal feature, built specifically to *not* feel like administering a task — and right now it can't tell you whether it worked.
- [WORTH DOING] First-tap discoverability: `[PLAY]` no longer plays anything. Someone who hasn't been told about the redesign will tap it expecting the old mini-game (or *some* kind of play) and instead get three lines to choose from. The label doesn't carry the new meaning. Worth a different label, or at minimum a one-time first-use caption explaining it.

---

### 8. Receiving a nudge / message

**The story:** You're out and about; a push notification says something arrived. You tap it.

**What I checked:** `sw.ts`'s `notificationclick` handler, `useMessages`'s queue-and-replay, `App.tsx`'s panel-priority (`playPickerOpen > messages.length > 0 > AsciiCat`).

**Findings:**
- [WORKS WELL] `notificationclick` just focuses/opens the app rather than deep-linking — but because undelivered messages persist server-side and replay on WebSocket connect, the message shows up in `MessageView` within moments of the app mounting anyway. Functionally this works, even without an explicit deep link — confirmed by tracing the replay path, not assumed.
- [WORKS WELL] A nudge and a typed note render through the exact same `MessageView` panel and take the same priority over the idle cat — no special-casing needed, no risk of a nudge getting lost behind something else.
- [WORTH DOING] Every open still pays the 1.2s `StartScreen` first (see #4) — for "I got a notification, I want to see what it says right now," that fixed delay is at its most noticeable here.
- [WORKS WELL] Dismissing a nudge correctly skips the generic `receiveMessage()` happiness bonus (it already paid out via the `play` care event at send time) — confirmed in `App.tsx`'s `handleDismissMessage`, no double-counting.

---

### 9. Both partners caring for the cat around the same time

**The story:** You feed the cat at 9am; without knowing it, your partner also feeds it at 9:02am from their own phone.

**What I checked:** `usePet.ts`'s `applyCareEvent`/`applyRemoteEvent`/`appliedEventIds` dedup, the documented CRDT-adjacent limitation in CLAUDE.md.

**Findings:**
- [WORKS WELL] This is solid, and already self-aware about its own limits. Each device replays both its own and the other's events through identical delta logic; the dedup-by-id ref correctly prevents an echoed broadcast from double-applying. The one edge case (two devices independently pushing the same stat toward its clamp while both offline) is explicitly documented as accepted, low-stakes, and non-destructive (growth/counters are unaffected, only a stat could end up a point or two apart at a boundary) — that's the right amount of engineering for what this is.
- **[IDEA] (raised carefully — the "connection" feature space was already explored at length earlier this session, and several ideas were deliberately rejected as feeling too task-like):** a very quiet, passive "last seen" signal — not a message, not an action, just e.g. a small `partner fed 2h ago`-style line available *if you go looking* for it (stats window seems like the natural home, not the main screen) — could reinforce "we're both actually doing this" a little more than care-events alone, which are silent unless you happen to be looking at the right moment. Flagging as worth a thought, not a recommendation — the user has good instincts about not wanting this to feel administrative, and this could easily tip that way if overbuilt.

---

### 10. One partner has a spotty connection

**The story:** Your partner sends a nudge from the subway, mid-tunnel, no signal.

**What I checked:** `useCareEvents.ts`'s outbox (`catmagochi-care-outbox-v1`), `useMessages.ts`'s `send()`.

**Findings:**
- [WORKS WELL] The care-event half of this (the stat/growth reward) is properly resilient: `emit()` queues to a `localStorage`-backed outbox first, only clears an entry once the POST actually succeeds, and retries opportunistically on `emit()` and on WebSocket reconnect. A feed/clean/pet/play action taken offline is never lost.
- **[SIGNIFICANT] The message half is not**, and this compounds finding #7. `useMessages.ts`'s `send()` is explicitly fire-and-forget — "unlike care events, a nudge isn't part of a replayed stat log, so there's no outbox to retry it from." That was a deliberate, reasoned tradeoff at the time (matching `sender.html`'s own no-retry behavior) — but it means a nudge sent with no signal is now **silently dropped twice over**: no confirmation it failed (per #7), *and* no retry once signal returns. The care-event reward still lands (your partner's cat still got fed), but the actual words — the entire point of sending a nudge from a subway platform — never arrive, with nothing telling either person that happened.

---

### 11. Turning on notifications

**The story:** Sometime after adopting the pet, you decide you want to hear from your partner even when the app is closed. You go looking for how.

**What I checked:** `Menu.tsx`'s settings view, `useNotificationSettings`'s default state, whether anything in the normal flow points here.

**Findings:**
- [WORKS WELL] The settings screen itself, once found, is clear: one global toggle gating three sub-toggles, each still reflecting its own stored value when disabled (so re-enabling doesn't silently reset your per-type choices), plus an honest note that "cat needs attention" is local-only.
- [WORTH DOING] Nothing in the adoption flow or the main screen ever points here. `global` defaults to `false` (correctly opt-in — never presume an OS permission prompt), but that also means the realistic path to ever turning this on is "happens to tap the unlabeled `[MENU]` button in the corner, happens to pick Settings, happens to notice the toggle." For a feature whose entire value is "know when your partner reaches out," relying on incidental discovery is a real risk that the recipient of this gift never actually enables it.

---

### 12. Installing it as a home-screen app

**The story:** First few opens happen in a regular browser tab. At some point (or never), it gets added to the home screen.

**What I checked:** `vite.config.ts`'s manifest config, whether there's any in-app install prompt.

**Findings:**
- [WORKS WELL] The manifest itself is set up correctly for a good install experience once triggered: `display: 'standalone'`, a matching `theme_color`/`background_color` to the app's own palette (so the OS-generated splash isn't a jarring mismatch), portrait lock.
- [WORTH DOING] There's no in-app install prompt anywhere — it's entirely dependent on the browser's own default behavior, which differs a lot by platform. Android Chrome will generally surface an install affordance on its own. **iOS Safari never does** — there's no `beforeinstallprompt` equivalent on iOS at all, and the only path is a manual Share → Add to Home Screen that nothing in this app currently mentions. If the actual gift recipient is on iPhone (a real possibility worth just asking about), they could use this in a regular Safari tab indefinitely without ever getting the standalone/splash/notification experience this session put a lot of work into, and never know there was a better way.

---

### 13. Watching the cat grow up

**The story:** After enough feeding/cleaning/petting/nudging, the cat crosses from kitten to young cat.

**What I checked:** `growthProgress`, the `.grow-banner` transition effect, `deriveStage`, and — this is where the audit found something unrelated to pacing — the actual art rendering in `src/data/asciiCat.ts`.

**Findings:**
- [WORKS WELL] The transition moment itself is well-built: a `GROW MESSAGE` banner (`GREW INTO A YOUNG CAT!`) with a glowing pulse animation, auto-dismissing after 2.5s, triggered off a `prevStage` ref comparison so it only fires on an actual transition, never on the initial kitten state. Good, deliberate craft.
- [WORKS WELL] The growth-progress bar (tap the stage badge) correctly shows progress *within the current band*, not raw growth against the wrong threshold — a young cat just past the young threshold reads as ~0% toward adult, not a misleading >100%. Confirmed via `growthProgress()`'s math.
- **[SIGNIFICANT] Documentation/reality mismatch, found while checking this.** `CLAUDE.md` currently describes `asciiCat.ts` as "analytic geometry rendered as text with supersampling... `DIMS`: kitten 40×36 → adult 60×52... mood mouths only exist for happy/sad/hungry/sleeping." **The actual current file is nothing like that** — it's a single verbatim braille-art image (explicitly commented "embedded VERBATIM — do not regenerate"), scaled by CSS `font-size` per stage (`.cat-sprite.stage-kitten/young/adult`), with **no stage-specific artwork at all** and **no mood-specific face at all** — `buildFrame`'s only branch is open-eyes vs. closed-eyes (blink or sleeping). This means: right now, a hungry, sad, or dirty cat looks *facially identical* to a happy one — the entire mood signal for those states comes from the floating caption and glyph, never from the cat's own expression, despite the docs describing per-mood face stamps that don't exist in the current code. This didn't come from this session's own work — it's a drift between docs and an earlier rewrite — but it's worth fixing the docs regardless of whether the behavior itself changes, since it actively misleads about how "watching the cat grow up" and "seeing how the cat feels" actually work today.
- **[IDEA] (flagged, not recommended without more thought):** given growth now scales the *same* art rather than using different art per stage, is a pure font-size scale-up the intended long-term "grew up" feel, or was some visual differentiation between kitten/young/adult (posture, proportions) part of the original intent before the braille-art rewrite? Worth a direct question rather than a guess, since I can't tell from the code alone which one was the deliberate choice.

---

### 14. Checking the stats window out of curiosity

**The story:** You're proud of how far the cat's come. You tap its name to see the numbers.

**What I checked:** `StatsWindow.tsx`'s row list, `daysAgo()`.

**Findings:**
- [WORKS WELL] Good, simple, does what it says — stage, mood, growth, days since adopted, exact stat percentages, and all four lifetime action counters, as a flat readable list. The `<h1><button>` nesting gotcha (preserving heading semantics while making the name tappable) shows real care for a detail most people wouldn't even test for.
- [WORTH DOING] As mentioned in #4/#9, there's no timing information here beyond `adoptedAt` — no "last fed," no "your partner's last visit." For a stats screen that already exists and is already the natural place someone goes to check "how are we doing," that's a reasonable gap to fill if the passive-signal idea in #9 goes anywhere.

---

### 15. Checking for app updates

**The story:** You remember a new version came out and want to grab it.

**What I checked:** `Menu.tsx`'s update view, `usePwaUpdate`/`useNativeUpdate` split, `useNativeUpdate.ts`'s GitHub-releases polling.

**Findings:**
- [WORKS WELL] The native-vs-PWA split is handled cleanly and correctly picks the right hook via `Capacitor.isNativePlatform()`, with distinct, accurate status text for each path (checking / up-to-date / downloading / ready / error / unsupported).
- [WORKS WELL] This whole flow was verified working end-to-end this session (the v1.0.7/1.0.8 releases), including the real gotcha of stripping `.env` before building the public OTA bundle so a local relay token can't leak into it. Confirmed via the actual release process, not just reading code.
- [WORTH DOING] Minor: checking for updates is manual-only (correctly documented as a deliberate choice, not an oversight, given the one-person-repo scale) — someone would need to already know to look in the menu. Not really a "problem" so much as a natural, accepted limitation of the current scope.

---

### 16. Using it on a Raspberry Pi kiosk screen (future)

**The story:** Per `CLAUDE.md`'s stated intent, this eventually runs full-time on a Pi with an attached screen, via Chromium in kiosk mode.

**What I checked:** `.game { max-width: 380px }` in `App.css`, `#root`'s centering, `orientation: 'portrait'` in the manifest.

**Findings:**
- [WORTH DOING] The entire app card is capped at 380px wide and centered inside `#root`'s flex layout. On a phone this is exactly right. On a larger kiosk display (most small attached touchscreens run 7"-10", often mounted landscape), that same layout would render as a small centered card with a large amount of unused space around it. That might be a perfectly fine, even charming "picture frame" aesthetic — or it might not be what's wanted once there's an actual screen to design for. Worth treating as an open question to revisit closer to when the Pi hardware is actually in hand, not something to guess-fix now with no real device or screen size to test against.
- [WORKS WELL] Nothing about the current interaction model (large tap targets, no hover-dependent affordances, no keyboard-only paths) would need rework for a touchscreen kiosk — it already assumes touch.

---

### 17. The relay isn't deployed yet (current real state)

**The story:** Not a hypothetical — this is where the project actually is right now.

**What I checked:** `IDEAS.md`'s own note ("real cross-device verification is still pending an actual Fly.io deployment"), the local `.env`'s stale tunnel URL from earlier testing.

**Findings:**
- **[SIGNIFICANT] This is the finding that makes #7 and #10 urgent rather than theoretical.** The messaging/shared-pet/nudge features — a large fraction of this session's work — have never been exercised against a real deployed relay with two real devices. Right now, if the actual gift recipient installs this app today, `VITE_RELAY_URL`/`VITE_RELAY_TOKEN` aren't baked into the public release build (confirmed clean in both the 1.0.7 and 1.0.8 bundles), so the app runs in fully standalone mode: FEED/CLEAN/PET/PLAY all work and reward the cat, but nothing ever leaves the device, and — per #7 — nothing in the UI says so. The single highest-leverage next step for this whole feature set isn't more UX polish; it's deploying `server/` to Fly.io and pointing a real build at it, so all of the above can be tested for real instead of by careful reading.

---

## Consolidated findings, in priority order

1. **[SIGNIFICANT] Decay pacing doesn't match the stated use case.** Every stat reaches its floor within roughly an hour of the last touch — including through sleep — which means routine multi-times-a-day check-ins (exactly what this app is for) always arrive to a cat in crisis rather than sometimes finding one doing fine. This is the root cause behind findings in #2, #3, #5, and #6. **Recommended fix:** slow `AWAKE_DECAY` and `SLEEP_RATE.fullness`/`.cleanliness` in `usePet.ts` so a stat takes roughly 4-6 hours of neglect to become a real signal, not the default resting state.
2. **[SIGNIFICANT] The relay isn't deployed, and the app never says so.** Nudges and, less critically, care-event syncs currently go nowhere for the real recipient, silently. Two independent things would help: deploying `server/` for real (the actual unblock), and giving `[PLAY]`/nudges *some* visible send-state (sent / queued-offline / no partner connected) so the feature is honest about what just happened regardless of deployment status.
3. **[SIGNIFICANT] Nudges have no retry path.** `useMessages.send()` is fire-and-forget by design; a nudge sent with no signal is lost even after the offline outbox pattern already built for care events would have caught it. Given the outbox mechanism already exists (`useCareEvents.ts`), extending a lighter version of it to `send()` is a bounded, well-precedented fix.
4. **[WORTH DOING] PLAY's new meaning isn't discoverable from the button alone.** A first tap after this session's redesign will surprise anyone who remembers (or expects) a mini-game. Worth a different label or a one-time explanatory caption.
5. **[WORTH DOING] Notifications are opt-in with zero in-app nudge toward opting in**, for a feature whose value is specifically "hear from your partner." A one-time, context-carrying prompt (not a bare OS permission dialog) would meaningfully raise the odds this actually gets turned on.
6. **[WORTH DOING] No install guidance, especially for iOS**, where there's no browser-native prompt at all. Worth a light, dismissible one-time hint.
7. **[WORTH DOING] CLAUDE.md's `asciiCat.ts` section is describing code that no longer exists** — a real rewrite happened (verbatim braille art, no stage-specific art, no mood-specific face) without the docs catching up. Independent of any UX decision, this should be corrected so it stops misleading future work on the cat's rendering.
8. **[WORTH DOING] The 1.2s StartScreen is fixed on every single open**, including "just glance for a second" and "I got a notification, show me now" — the two scenarios where it's most noticeable as friction rather than delight.

## New ideas (not problems — possibilities worth a conversation)

- A quiet, easy-to-ignore "last seen" signal for the other person's care (stats window, not the main screen) — raised carefully in #9, given how deliberately the task-like framing was avoided earlier this session; this is offered as a thought, not a pitch.
- Revisit whether growth stages deserve any silhouette-level visual differentiation now that the art is a single scaled braille image rather than per-stage generated art — genuinely unclear from the code alone whether that's a deliberate simplification or a side effect of the rewrite.
- Once there's a real Pi + screen in hand, reconsider whether the fixed 380px card is the right kiosk layout or whether it's worth a wider "at a glance from across the room" treatment for that specific context.

---

*Written as a single continuous pass rather than an artificial step-by-step, since the underlying code tracing for each scenario was done as part of writing it — see the todo list for how this was tracked in the session it was written in.*
