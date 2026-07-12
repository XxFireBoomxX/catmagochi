# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Catmagochi is a Tamagotchi-style virtual cat web app — a personal gift project with a hard deadline. It runs as an installable PWA so it works from a phone browser today, and is intended to later run on a Raspberry Pi with an attached screen (via Chromium in kiosk mode pointed at this same app, not a native rewrite). Keep the UI touch-friendly and flexible to small screen sizes, and avoid platform-specific APIs that wouldn't run in a plain browser (no native mobile modules, no App Store-only features).

## Commands

- `npm run dev` — start the Vite dev server
- `npm run build` — type-check (`tsc -b`) then production-build with Vite (also generates the PWA service worker/manifest via `vite-plugin-pwa`)
- `npm run lint` — run `oxlint`
- `npm run preview` — serve the production build locally
- No test suite exists yet.
- Relay server (optional, for the messaging feature — see `server/README.md`): `cd server && npm install && RELAY_TOKEN=<secret> npm start`.

## Architecture

The game itself is client-only React + TypeScript. Pet state lives in `localStorage` — there's no server or API layer for gameplay. The one exception is the optional messaging feature (§ below), which talks to a small self-hosted relay in `server/`.

- `src/types.ts` — `PetStats` (fullness/happiness/energy/cleanliness, each 0–100), `Mood`, `Stage` (`kitten`/`young`/`adult`), and `PetSave` (the persisted shape: name, stats, sleeping flag, lastUpdate timestamp, `growth`).
- `src/hooks/usePet.ts` — all game logic lives here:
  - Loads/saves a single `PetSave` under the `catmagochi-save-v1` localStorage key. `loadSave()` merges `{ growth: 0, ...parsed }` so saves from before the growth feature don't break `deriveStage`.
  - Stat decay/regen is time-based, not tick-based: every 5s (`TICK_MS`) it recomputes stats from elapsed real milliseconds since `lastUpdate` using per-minute rates (`AWAKE_DECAY` vs `SLEEP_RATE`). This is also applied once on load, so stats "catch up" for time the app was closed (capped at 12 simulated hours so long absences don't require special-casing).
  - `deriveMood(stats, sleeping)` maps stats to a `Mood` by priority (sleeping > hungry > tired > dirty > sad > happy/content) — this is the single source of truth for both the on-screen mood text and which ASCII frame set renders.
  - `growth` (on `PetSave`, not `PetStats`) is earned only through positive actions, never passively over time: `feed` +3, `clean` +2, `pet` +1, `playGame(hits)` +1 to +7. `src/data/growth.ts`'s `deriveStage(growth)` turns that into a `Stage`.
  - Actions (`feed`, `playGame`, `clean`, `toggleSleep`) are disabled while asleep except waking up. `pet()` is cooldown-gated (`PET_COOLDOWN_MS`, tracked via a ref, not persisted) and returns a boolean indicating whether it actually applied, so the UI only shows a reaction when the happiness bump really happened.
- `src/data/growth.ts` — `GROWTH_THRESHOLDS`, `deriveStage`, `STAGE_LABEL` (badge text), `GROW_MESSAGE` (banner text shown only on `young`/`adult` transitions, not the initial `kitten` state).
- `src/data/asciiCat.ts` — `ASCII_FRAMES: Record<Mood, [string, string]>`, two same-width 3-line frames per mood (resting + blink/variant), face-only and stage-agnostic. `buildFrame(mood, frame, stage)` appends stage-specific body/tail lines from `BODY_LINES` (kitten: none, young: +paws, adult: +paws+tail) — growing the art without needing per-stage mood art.
- `src/components/AsciiCat.tsx` + `AsciiCat.css` — the cat is a monospace `<pre>` block (via `buildFrame`) inside a pastel "screen" panel, not an image/sprite. A chained-`setTimeout` blink loop alternates the two frames per mood (resets on mood change); a floating **plain-ASCII** effect (`EFFECT` map — `*`, `?`, `;;`, `~`, `-.-`; no emoji anywhere in the app) plays above it, replaced by `<3` when `onPet()` succeeds. Add new moods by extending the `Mood` union in `types.ts`, adding a case to `deriveMood`, and adding a frame pair to `ASCII_FRAMES`.
- `src/components/YarnGame.tsx` + `YarnGame.css` — the mini-game that replaces `AsciiCat` in place (same panel chrome, imports `AsciiCat.css` for the shared `.ascii-screen` class) while `[PLAY]` is active. Local, non-persisted state machine (`round`/`phase`/timers) runs 3 rounds of "tap the `o` before it disappears," then calls `onComplete(hits)` back up to `App.tsx`, which is what actually applies `playGame(hits)`.
- `src/data/flavorText.ts` + `src/hooks/useFlavorText.ts` — `MOOD_LABEL` is the steady-state caption per mood; `useFlavorText` periodically (chained `setTimeout`, ~6-10s jittered) swaps in a random line from `FLAVOR_TEXT[mood]` (falling back to `GENERIC_FLAVOR`) for a few seconds before reverting. Resets whenever `mood` changes.
- `src/components/StatBar.tsx` — renders an ASCII block-character bar (`████░░░░`, 10 segments) plus a 4-letter `code` label, colored by low/mid/high threshold; accepts an `isPulsing` prop (now a `Set<keyof PetStats>` in `App.tsx`, since `playGame` can pulse multiple stats at once) for the brief glow shown right after an action changes that stat.
- `src/App.tsx` — top-level flow: shows `NameScreen` until a save exists (first run), otherwise renders the game screen driven by `usePet` and `useFlavorText`. `gameActive` state swaps `AsciiCat` for `YarnGame` in place when `[PLAY]` is pressed (all other action buttons disabled meanwhile). A `prevStage` ref + `useEffect` detects stage transitions and shows a transient `.grow-banner`.

### Visual theme

Dark purple retro-terminal look (deliberate single theme, not responsive to system light/dark preference — see `src/index.css`): monospace font globally, CSS variables for the palette (`--bg`, `--text`, `--border`, `--primary`, `--glow`, etc.), bordered sharp-cornered boxes instead of rounded cards, bracket-style buttons (`[FEED]`). Keep all UI text and effects to plain ASCII/CSS — no emoji — to stay consistent with this theme.

### Messaging ("send from home")

Lets the user push short messages to the app from anywhere, via a self-hosted relay (not a managed third-party service — see `server/README.md` for why and how to deploy). Same panel-swap pattern as `YarnGame`.

- `server/server.js` — standalone Node process (own `package.json`, not part of the Vite build/frontend). Plain `http` + `ws`, no framework. `GET /ws?token=` upgrades to a WebSocket after checking `RELAY_TOKEN`; `POST /send` (also token-checked) queues a message and broadcasts it to connected sockets. Undelivered messages persist to `server/messages.json` (or `$DATA_DIR/messages.json` in production, meant to be a mounted volume) and replay to a client as soon as it connects, so messages sent while the device is offline still arrive. Clients ack (`{type:'ack', id}`) once a message is actually displayed, not just received.
- `src/hooks/useMessages.ts` — no-ops entirely (never opens a socket) if `VITE_RELAY_URL`/`VITE_RELAY_TOKEN` aren't set at build time, so the app works standalone before/without the relay. Otherwise connects and auto-reconnects with a chained-`setTimeout` backoff (1s → 30s cap), same style as the blink loop in `AsciiCat.tsx` and `useFlavorText.ts`. Holds a local FIFO `messages` queue.
- `src/components/MessageView.tsx` — reuses `.ascii-screen` from `AsciiCat.css` (same "one little screen, different content" pattern as `YarnGame`). Tapping calls `dismiss(id)` (acks + removes from the local queue); `App.tsx` also calls `usePet`'s `receiveMessage()` (+5 happiness, no growth — receiving a note isn't "care" the way feeding/playing/cleaning is) on dismiss.
- In `App.tsx`, render priority in the shared panel slot is `YarnGame` > `MessageView` > `AsciiCat` — an incoming message never interrupts an in-progress mini-game, it just waits. `actionsDisabled` includes `messages.length > 0`.
- `sender.html` (repo root) — a standalone plain HTML/JS page (no build step, not part of the React app or PWA) for actually sending messages: a textarea posting to `RELAY_URL/send`. Deliberately kept out of the main app bundle so there's no path for the message recipient to stumble into a "send" UI.
- The `RELAY_TOKEN`/`VITE_RELAY_TOKEN` shared secret is not real auth — it ends up in the client bundle, so treat it as "keeps random strangers out," not a security boundary. See `server/README.md` for rotating it.

### Menu

`src/components/Menu.tsx` is a full-card overlay (`position: absolute; inset: 0` inside `.game`, which needs `position: relative`), opened via the `[MENU]` button in the top-right corner (`App.tsx`, disabled while `gameActive` — checking the menu mid-minigame isn't blocked from a message being shown, only from an active game). Internal `view: 'root' | 'history'` state, reset to `'root'` whenever it opens. The root view is a data-driven `MENU_ITEMS` array specifically so new entries (e.g. future settings) are a one-line addition, not a restructure.

`src/hooks/useMessageHistory.ts` persists dismissed messages to `catmagochi-message-history-v1` (capped at 50, newest first) — separate from `useMessages`' in-flight queue, which only holds undismissed messages. `App.tsx`'s `handleDismissMessage` calls `record(message)` alongside the existing `dismiss`/`receiveMessage`/pulse calls, so history capture piggybacks on the same dismissal path rather than being a separate flow.

### PWA setup

`vite-plugin-pwa` is configured in `vite.config.ts` with an inline manifest (name, theme colors, icons) pointing at `public/favicon.svg`. `registerType: 'autoUpdate'` is used so updates apply without prompting. If you change the app icon, only `public/favicon.svg` needs updating — it's reused for both the favicon and the manifest icons.
