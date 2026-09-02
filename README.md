# Catmagochi

A Tamagotchi-style virtual cat that lives in your browser. Feed it, clean it,
pet it, and send someone a note through it.

It's a personal gift project, built as an installable PWA so it works from a
phone today and can later run on a Raspberry Pi with a small screen (Chromium
in kiosk mode pointed at the same app — no native rewrite).

```
        ⢠⣿⣿⣦          ⢀⣴⣿⣦⡀
      ⢠⣿⣿⣿⣿⣆        ⣾⣿⣿⣿⣷
     ⣾⣿⣿⣿⣿⣿⡆      ⣸⣿⣿⣿⣿⣿⡆
    ⣿⣿⣿⣿⣿⣿⣿⣿⣠⣤⣤⣼⣿⣿⣿⣿⣿⣿⣿⣷
   ⣿⣿⣿⣿⠟⠁    ⠹⣿⣿⣿⣿⠟⠁   ⠹⣿⡿
   ⣿⣿⣿⡇   ⢼⣿ ⢿⣿⣿⣿ ⣾⣷   ⢿⣿⣷
```

## What it does

- **A cat that needs looking after.** Fullness, happiness, energy and
  cleanliness decay in real time — including while the app is closed, so it
  catches up when you come back (capped at 12 simulated hours).
- **It grows.** Positive actions earn growth: kitten → young cat → adult cat.
  Growth is only ever earned by caring for it, never by waiting.
- **Notes from home.** A tiny self-hosted relay lets someone send short
  messages to the app from anywhere. They queue while the device is offline
  and arrive on reconnect.
- **One cat, two devices.** Care actions sync between devices as an event log
  rather than raw stat numbers, so two people looking after the same cat merge
  instead of overwriting each other.
- **[PLAY] sends a nudge.** Not a mini-game: pick one of a few short lines and
  it both rewards the shared cat and sends the line to the other device.
- **Push notifications** for new messages and new releases, plus a local-only
  "your cat needs attention" alert.

Everything is plain ASCII on a dark purple retro-terminal theme — no emoji,
no images.

## Running it

```
npm install
npm run dev
```

The game itself is client-only: pet state lives in `localStorage`, and there
is no server or API in the way. The messaging, shared-pet and push features
are optional and need the relay in [`server/`](server/README.md); without it
the app runs standalone and those features simply no-op.

| | |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check, then production build (also emits the PWA service worker/manifest) |
| `npm run preview` | Serve the production build |
| `npm test` | Frontend test suite (Vitest) — `test:watch`, `test:coverage` |
| `npm run lint` | oxlint |

The relay has its own suite, run separately: `cd server && npm test`.

## Layout

```
src/
  hooks/usePet.ts       all the game logic -- stats, decay, growth, care events
  data/asciiCat.ts      the cat, as verbatim braille art
  components/           the screen: cat, stat bars, menu, message view
server/                 optional self-hosted relay (messaging + sync + push)
sender.html             standalone page for sending a note to the app
```

`CLAUDE.md` carries the detailed architecture notes and the reasoning behind
the less obvious decisions.
