# Ideas & Bugs

Running list of things to maybe do or fix. Not a promise, just a place to dump stuff instead of losing it.

## Ideas

- ~~Connected/shared pet: instead of each device having its own independent local `PetSave`, sync the actual pet state (stats, growth, sleeping) between devices so it feels like one kitty we both adopted and take care of together, not two separate cats that just send each other notes.~~ Done — care actions (feed/clean/pet/play) sync as a replayed event log over the same relay, not raw stat numbers, so simultaneous offline actions from both devices merge instead of clobbering each other; see CLAUDE.md's "Shared pet" section and `server/README.md`'s section of the same name. `sleeping` deliberately stays per-device/unsynced, unlike the original wording above — it's a local UI toggle, not a care action, and syncing it would mean one person's nap forcibly blocking the other's actions. Fully offline-capable: local actions apply immediately regardless of connectivity, and a small client-side outbox retries sending once the relay is reachable again. Verified via unit/integration tests simulating both sides of the sync (no deployed relay or second device to test against yet) — real cross-device verification is still pending an actual Fly.io deployment.

- ~~Progress bar when you tap the stage badge ("[KITTEN]" etc) — show how much growth is left until the next stage.~~ Done — tap toggles a reused `StatBar` showing progress within the current stage's band; adult (maxed) shows a "fully grown!" line instead of a bar.

- ~~Push notifications on phone + a Settings section in the Menu: a global notifications on/off toggle, and underneath it a per-notification-type toggle so you can turn off individual ones without killing all of them.~~ Done — `message`/`update` are real server push (via the relay), `attention` (cat needs care) is local-only since pet state never reaches the server. See CLAUDE.md's "Push notifications" section. Still needs: real VAPID keys generated for the actual deployed relay (currently only a throwaway local-testing pair), and Fly.io deployment itself before any of this works from a closed app.

- ~~Tapping the cat's name brings up a stats window with more detail than the four visible stat bars — some kind of extended stats/history view.~~ Done — new `StatsWindow` overlay shows stage, mood, growth, days since adopted, exact stat percentages, and lifetime action counts (times fed/played/cleaned/petted). Added `adoptedAt` + `total*` counters to `PetSave` to make this possible.

## Bugs

-
