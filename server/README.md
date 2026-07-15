# Catmagochi relay server

A tiny WebSocket relay so you can send messages from anywhere to the Catmagochi app, plus optional Web Push notifications. Not part of the Vite build — deployed and run separately.

## Run locally

```
cd server
npm install
RELAY_TOKEN=some-long-random-string npm start
```

Pick `RELAY_TOKEN` yourself — it's the shared secret both the app and the sender page need to know. Anyone with the URL *and* the token can send/receive, so treat it like a password (long and random, not `test123`).

Point the frontend at it for local testing by setting, in the repo root `.env`:

```
VITE_RELAY_URL=ws://localhost:8080
VITE_RELAY_TOKEN=some-long-random-string
```

## Deploy to Fly.io

Fly's free allowance keeps a small always-on machine running (unlike Render/Railway free tiers, which sleep idle instances — bad for a persistent WebSocket). One-time setup:

```
brew install flyctl   # or see https://fly.io/docs/flyctl/install/
fly auth login
cd server
fly launch --no-deploy   # creates/adjusts fly.toml, pick a unique app name when asked
fly volumes create catmagochi_data --size 1   # 1GB, for messages.json to survive restarts
fly secrets set RELAY_TOKEN=some-long-random-string
fly deploy
```

Your relay is then reachable at `wss://<your-app-name>.fly.dev/ws` (Fly terminates TLS for you, so it's `wss://`, not `ws://`).

Update the deployed frontend's `.env` (or hosting provider's env vars) to:

```
VITE_RELAY_URL=wss://<your-app-name>.fly.dev
VITE_RELAY_TOKEN=some-long-random-string
```

and rebuild (`npm run build`) so the new values are baked into the bundle.

## Rotating the token

`fly secrets set RELAY_TOKEN=<new-value>` on the server, then update `VITE_RELAY_TOKEN` everywhere that has it (the app's `.env` + rebuild, and `sender.html`) and redeploy/reopen both. Anyone with the old token loses access immediately since the server stops accepting it.

## Push notifications (optional)

The relay can also send real Web Push notifications — "new message" and "update available" both go through the *same* subscription/relay infra as messaging; only "cat needs attention" is local-only (the server has no visibility into pet stats, which live in the app's `localStorage`, so it can't push that one — see `useAttentionNotifications` client-side).

Push is entirely optional and additive: without VAPID keys configured, `/push/subscribe` still accepts and stores subscriptions (so client/server rollout order doesn't matter), it just never actually sends anything.

Generate a keypair once:

```
npx web-push generate-vapid-keys
```

Set both halves as server secrets (`fly secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...` in production, or export them locally), plus a `VAPID_SUBJECT` (a `mailto:` address or URL — required by the Push API spec so push services have a way to contact you about the key if needed; defaults to a placeholder if unset). Then put the **public** half in the app's `.env` too:

```
VITE_VAPID_PUBLIC_KEY=<the public key from above>
```

and rebuild. The private key never goes near the client.

"Update available" isn't polled automatically — the server has no timer checking GitHub for new releases, to avoid rate-limit/complexity for a one-person-repo. Trigger it yourself right after publishing a release:

```
curl -X POST https://<your-app-name>.fly.dev/push/notify-update \
  -H 'Content-Type: application/json' \
  -d '{"token":"your-relay-token","version":"1.0.7"}'
```

## Notes

- Messages waiting for delivery are kept in `messages.json` (on the mounted volume in production) and replayed to the app the next time it connects — so a message sent while the phone/Pi is offline still arrives once it reconnects.
- Push subscriptions are kept in `subscriptions.json` (same mounted-volume treatment). Entries the push service reports as gone (404/410 — uninstalled, permission revoked) are pruned automatically the next time a push is attempted, rather than retried forever.
- No accounts, no database — this is intentionally minimal for a low-stakes "send a sweet note" feature, not a general chat backend.
