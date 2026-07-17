import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { WebSocketServer } from 'ws'
import webpush from 'web-push'

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080
const RELAY_TOKEN = process.env.RELAY_TOKEN
const DATA_DIR = process.env.DATA_DIR ? process.env.DATA_DIR.replace(/\/$/, '') : null
const MESSAGES_FILE = DATA_DIR
  ? new URL(`file://${DATA_DIR}/messages.json`)
  : new URL('./messages.json', import.meta.url)
const SUBSCRIPTIONS_FILE = DATA_DIR
  ? new URL(`file://${DATA_DIR}/subscriptions.json`)
  : new URL('./subscriptions.json', import.meta.url)
const EVENTS_FILE = DATA_DIR
  ? new URL(`file://${DATA_DIR}/care-events.json`)
  : new URL('./care-events.json', import.meta.url)
const MAX_TEXT_LENGTH = 500
const PING_INTERVAL_MS = 25_000
const CARE_EVENT_TYPES = new Set(['feed', 'clean', 'pet', 'play'])
const MESSAGE_KINDS = new Set(['nudge'])

if (!RELAY_TOKEN) {
  console.error('RELAY_TOKEN env var is required')
  process.exit(1)
}

// Push is optional: subscriptions can still be accepted/stored without VAPID
// keys configured (so client/server rollout order doesn't matter), but no
// actual push is ever sent until both are set.
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const PUSH_ENABLED = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)
if (PUSH_ENABLED) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

let pending = []
if (existsSync(MESSAGES_FILE)) {
  try {
    pending = JSON.parse(readFileSync(MESSAGES_FILE, 'utf-8'))
  } catch {
    pending = []
  }
}

function persist() {
  writeFileSync(MESSAGES_FILE, JSON.stringify(pending, null, 2))
}

let subscriptions = []
if (existsSync(SUBSCRIPTIONS_FILE)) {
  try {
    subscriptions = JSON.parse(readFileSync(SUBSCRIPTIONS_FILE, 'utf-8'))
  } catch {
    subscriptions = []
  }
}

function persistSubscriptions() {
  writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2))
}

// Care events (feed/clean/pet/play) for the shared-pet sync -- same
// queue-and-replay shape as `pending` messages above, kept as a fully
// separate store since they're a different domain (game-state deltas, not
// chat notes) even though the transport mechanics are identical.
let pendingEvents = []
if (existsSync(EVENTS_FILE)) {
  try {
    pendingEvents = JSON.parse(readFileSync(EVENTS_FILE, 'utf-8'))
  } catch {
    pendingEvents = []
  }
}

function persistEvents() {
  writeFileSync(EVENTS_FILE, JSON.stringify(pendingEvents, null, 2))
}

// Sends a push to every subscriber who hasn't opted out of `type`. Prunes
// subscriptions the push service reports as gone (404/410 -- uninstalled,
// permission revoked, etc.) rather than retrying them forever.
async function pushToSubscribers(type, payload) {
  if (!PUSH_ENABLED) return
  const targets = subscriptions.filter((s) => s.types?.[type] !== false)
  const body = JSON.stringify({ type, ...payload })
  const stale = []
  await Promise.all(
    targets.map(async (entry) => {
      try {
        await webpush.sendNotification(entry.subscription, body)
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) stale.push(entry.subscription.endpoint)
      }
    }),
  )
  if (stale.length > 0) {
    subscriptions = subscriptions.filter((s) => !stale.includes(s.subscription.endpoint))
    persistSubscriptions()
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch (err) {
        reject(err)
      }
    })
  })
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    setCors(res)
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'POST' && req.url === '/send') {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      setCors(res)
      try {
        const { token, text, kind, id } = JSON.parse(body)
        if (token !== RELAY_TOKEN) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'invalid token' }))
          return
        }
        const trimmed = typeof text === 'string' ? text.trim().slice(0, MAX_TEXT_LENGTH) : ''
        if (!trimmed) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'text is required' }))
          return
        }
        const message = {
          id: typeof id === 'string' && id ? id : randomUUID(),
          text: trimmed,
          sentAt: Date.now(),
          kind: MESSAGE_KINDS.has(kind) ? kind : undefined,
        }
        // No id-dedup on push -- a client-retried id (see useMessages.ts's
        // outbox) becomes a second pending entry here even if the first
        // POST actually succeeded. Ack removes every copy sharing that id
        // (see the 'ack' handler below), so this is at-least-once by
        // design, not exactly-once: the accepted gap is a duplicate
        // reappearing if the recipient dismissed the first copy before the
        // retry lands. Judged not worth a persistent seen-ids set for a
        // personal-scale relay.
        pending.push(message)
        persist()
        broadcast(message)
        pushToSubscribers('message', { title: 'Catmagochi', body: trimmed })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, id: message.id }))
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid request' }))
      }
    })
    return
  }

  if (req.method === 'POST' && req.url === '/push/subscribe') {
    setCors(res)
    readJsonBody(req).then(
      ({ token, subscription, types }) => {
        if (token !== RELAY_TOKEN) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'invalid token' }))
          return
        }
        if (!subscription?.endpoint || !subscription.keys) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'invalid subscription' }))
          return
        }
        subscriptions = subscriptions.filter((s) => s.subscription.endpoint !== subscription.endpoint)
        subscriptions.push({ subscription, types: types && typeof types === 'object' ? types : {} })
        persistSubscriptions()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, pushEnabled: PUSH_ENABLED }))
      },
      () => {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid request' }))
      },
    )
    return
  }

  if (req.method === 'POST' && req.url === '/push/unsubscribe') {
    setCors(res)
    readJsonBody(req).then(
      ({ token, endpoint }) => {
        if (token !== RELAY_TOKEN) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'invalid token' }))
          return
        }
        subscriptions = subscriptions.filter((s) => s.subscription.endpoint !== endpoint)
        persistSubscriptions()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      },
      () => {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid request' }))
      },
    )
    return
  }

  // Manually triggered (not polled) -- run this yourself after publishing a
  // GitHub release. See server/README.md.
  if (req.method === 'POST' && req.url === '/push/notify-update') {
    setCors(res)
    readJsonBody(req).then(
      ({ token, version }) => {
        if (token !== RELAY_TOKEN) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'invalid token' }))
          return
        }
        const body = typeof version === 'string' && version ? `Version ${version} is ready.` : 'A new version is ready.'
        pushToSubscribers('update', { title: 'Catmagochi update available', body })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      },
      () => {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid request' }))
      },
    )
    return
  }

  // Shared-pet care events (feed/clean/pet/play). The client generates `id`
  // itself (not the server, unlike /send) so it can mark the id as already
  // applied *before* the broadcast echo comes back over its own WebSocket
  // connection -- every connected client receives every broadcast,
  // including the one that just sent it.
  if (req.method === 'POST' && req.url === '/care-event') {
    setCors(res)
    readJsonBody(req).then(
      ({ token, id, type }) => {
        if (token !== RELAY_TOKEN) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'invalid token' }))
          return
        }
        if (typeof id !== 'string' || !id || !CARE_EVENT_TYPES.has(type)) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'invalid event' }))
          return
        }
        const event = {
          id,
          eventType: type,
          sentAt: Date.now(),
        }
        pendingEvents.push(event)
        persistEvents()
        broadcastEvent(event)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      },
      () => {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid request' }))
      },
    )
    return
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('catmagochi relay running')
})

const wss = new WebSocketServer({ noServer: true })

function broadcast(message) {
  const frame = JSON.stringify({ type: 'message', ...message })
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(frame)
  }
}

function broadcastEvent(event) {
  const frame = JSON.stringify({ type: 'care-event', ...event })
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(frame)
  }
}

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  if (url.pathname !== '/ws' || url.searchParams.get('token') !== RELAY_TOKEN) {
    socket.destroy()
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
})

wss.on('connection', (ws) => {
  ws.isAlive = true
  ws.on('pong', () => { ws.isAlive = true })

  for (const message of pending) {
    ws.send(JSON.stringify({ type: 'message', ...message }))
  }
  for (const event of pendingEvents) {
    ws.send(JSON.stringify({ type: 'care-event', ...event }))
  }

  ws.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString())
      if (parsed.type === 'ack' && parsed.id) {
        const pendingBefore = pending.length
        pending = pending.filter((m) => m.id !== parsed.id)
        if (pending.length !== pendingBefore) persist()

        const eventsBefore = pendingEvents.length
        pendingEvents = pendingEvents.filter((e) => e.id !== parsed.id)
        if (pendingEvents.length !== eventsBefore) persistEvents()
      }
    } catch {
      // ignore malformed frames
    }
  })
})

const pingInterval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate()
      continue
    }
    ws.isAlive = false
    ws.ping()
  }
}, PING_INTERVAL_MS)

server.on('close', () => clearInterval(pingInterval))

server.listen(PORT, () => {
  console.log(`catmagochi relay listening on :${PORT}`)
})
