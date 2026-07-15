# Ideas & Bugs

Running list of things to maybe do or fix. Not a promise, just a place to dump stuff instead of losing it.

## Ideas

- Connected/shared pet: instead of each device having its own independent local `PetSave`, sync the actual pet state (stats, growth, sleeping) between devices so it feels like one kitty we both adopted and take care of together, not two separate cats that just send each other notes. Would build on the relay/messaging infra already in place, but is a bigger step than messaging — that only sends one-off notes, this would need the pet's state itself to stay in sync.
  - Should stay fully offline-capable, not require internet to use — the app's whole appeal is being able to glance at/feed the cat anytime, and requiring connectivity would break that.
  - Sync opportunistically in the background whenever there's connectivity (reuse the relay), rather than gating any interaction on being online.
  - Don't sync raw stat numbers — two people feeding the same cat while both offline would just have one overwrite the other. Instead sync a log of care *events* (feed/clean/pet/play, each timestamped), and have each device replay both its own and the other's events in order to arrive at the same stats. That way simultaneous offline actions merge instead of clobbering each other.

- ~~Progress bar when you tap the stage badge ("[KITTEN]" etc) — show how much growth is left until the next stage.~~ Done — tap toggles a reused `StatBar` showing progress within the current stage's band; adult (maxed) shows a "fully grown!" line instead of a bar.

- ~~Push notifications on phone + a Settings section in the Menu: a global notifications on/off toggle, and underneath it a per-notification-type toggle so you can turn off individual ones without killing all of them.~~ Done — `message`/`update` are real server push (via the relay), `attention` (cat needs care) is local-only since pet state never reaches the server. See CLAUDE.md's "Push notifications" section. Still needs: real VAPID keys generated for the actual deployed relay (currently only a throwaway local-testing pair), and Fly.io deployment itself before any of this works from a closed app.

- ~~Tapping the cat's name brings up a stats window with more detail than the four visible stat bars — some kind of extended stats/history view.~~ Done — new `StatsWindow` overlay shows stage, mood, growth, days since adopted, exact stat percentages, and lifetime action counts (times fed/played/cleaned/petted). Added `adoptedAt` + `total*` counters to `PetSave` to make this possible.

## Bugs

-
