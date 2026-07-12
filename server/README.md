# Catmagochi relay server

A tiny WebSocket relay so you can send messages from anywhere to the Catmagochi app. Not part of the Vite build — deployed and run separately.

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

## Notes

- Messages waiting for delivery are kept in `messages.json` (on the mounted volume in production) and replayed to the app the next time it connects — so a message sent while the phone/Pi is offline still arrives once it reconnects.
- No accounts, no database — this is intentionally minimal for a low-stakes "send a sweet note" feature, not a general chat backend.
