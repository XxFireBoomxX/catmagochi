import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs'
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

// A push subscription tells this server where to deliver the plaintext of
// every message, encrypted to keys the subscriber supplies. Storing an
// arbitrary caller-supplied endpoint would therefore turn the bundled token
// -- which is only "keeps random strangers out", and ships in the client JS
// -- into permanent message exfiltration: register your own server as an
// endpoint and every note is delivered to you, decryptable with your own
// keys, and never pruned (that only happens on 404/410, which you control).
// So only real push services are accepted. An entry starting with '.'
// matches that domain and any subdomain.
const DEFAULT_PUSH_HOSTS = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
  '.push.services.mozilla.com',
  '.notify.windows.com',
]
// Extends (never replaces) the built-in list, for a self-hosted push service
// or a test fixture -- see server/README.md.
const PUSH_ALLOWED_HOSTS = [
  ...DEFAULT_PUSH_HOSTS,
  ...(process.env.PUSH_ALLOWED_HOSTS || '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean),
]

function isAllowedPushEndpoint(endpoint) {
  let url
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  return PUSH_ALLOWED_HOSTS.some((entry) =>
    entry.startsWith('.') ? url.hostname.endsWith(entry) : url.hostname === entry,
  )
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

// writeFileSync truncates the target before writing it, so a crash, OOM or
// redeploy midway through leaves half-written JSON on the volume -- and the
// loader below then reads it as an empty queue. Writing to a sibling temp
// file and renaming makes the swap atomic on the same filesystem: readers
// see either the old file or the new one, never a partial one.
function writeJsonAtomic(file, value) {
  const tmp = new URL(`${file.href}.tmp`)
  writeFileSync(tmp, JSON.stringify(value, null, 2))
  renameSync(tmp, file)
}

// Starting empty is the right recovery, but doing it silently makes a total
// loss of the queue look identical to a healthy boot. Say so on stderr.
function readJsonArray(file, label) {
  if (!existsSync(file)) return []
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8'))
    if (Array.isArray(parsed)) return parsed
    console.error(`${label} at ${file.href} is not an array; starting empty`)
  } catch (err) {
    console.error(`could not read ${label} at ${file.href}; starting empty:`, err.message)
  }
  return []
}

let pending = readJsonArray(MESSAGES_FILE, 'pending messages')

function persist() {
  writeJsonAtomic(MESSAGES_FILE, pending)
}

let subscriptions = readJsonArray(SUBSCRIPTIONS_FILE, 'push subscriptions')

function persistSubscriptions() {
  writeJsonAtomic(SUBSCRIPTIONS_FILE, subscriptions)
}

// Care events (feed/clean/pet/play) for the shared-pet sync -- same
// queue-and-replay shape as `pending` messages above, kept as a fully
// separate store since they're a different domain (game-state deltas, not
// chat notes) even though the transport mechanics are identical.
let pendingEvents = readJsonArray(EVENTS_FILE, 'pending care events')

function persistEvents() {
  writeJsonAtomic(EVENTS_FILE, pendingEvents)
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
        const { token, text, kind, id, origin } = JSON.parse(body)
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
          // Absent for sender.html, which has no WebSocket to be echoed to.
          origin: typeof origin === 'string' && origin ? origin : undefined,
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
        broadcastRecord('message', message)
        // A per-message tag, so two notes stack instead of the second
        // silently replacing the first (showNotification with an existing
        // tag REPLACES it, and renotify defaults to false -- no second
        // buzz). update/attention keep coalescing by type on purpose.
        pushToSubscribers('message', { title: 'Catmagochi', body: trimmed, tag: `message-${message.id}` })
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
        if (!isAllowedPushEndpoint(subscription.endpoint)) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'unsupported push endpoint' }))
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
      ({ token, id, type, origin }) => {
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
          origin: typeof origin === 'string' && origin ? origin : undefined,
        }
        pendingEvents.push(event)
        persistEvents()
        broadcastRecord('care-event', event)
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

// `origin` is delivery bookkeeping, not part of the wire contract -- clients
// tag what they send so we can route it, but never see the field come back.
function frameFor(type, record) {
  const rest = { ...record }
  delete rest.origin
  return JSON.stringify({ type, ...rest })
}

// A device never receives what it sent itself. It already applied the action
// locally, and because `pending`/`pendingEvents` are a single shared queue
// drained by the *first* ack from any client, a sender acking its own echo
// would delete the item before the other device ever connected -- destroying
// exactly the offline delivery the queue exists to provide.
//
// An item with no origin (e.g. sender.html, which has no WebSocket of its
// own) belongs to no device and goes to everyone.
function isOwnEcho(record, ws) {
  return Boolean(record.origin) && ws.deviceId === record.origin
}

function broadcastRecord(type, record) {
  const frame = frameFor(type, record)
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN && !isOwnEcho(record, client)) client.send(frame)
  }
}

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  if (url.pathname !== '/ws' || url.searchParams.get('token') !== RELAY_TOKEN) {
    socket.destroy()
    return
  }
  // Which device this socket belongs to, so we can skip echoing back what it
  // sent itself. Absent for any client that doesn't identify itself, which
  // simply means it receives everything.
  const deviceId = url.searchParams.get('device') || null
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.deviceId = deviceId
    wss.emit('connection', ws, req)
  })
})

wss.on('connection', (ws) => {
  ws.isAlive = true
  ws.on('pong', () => { ws.isAlive = true })

  for (const message of pending) {
    if (!isOwnEcho(message, ws)) ws.send(frameFor('message', message))
  }
  for (const event of pendingEvents) {
    if (!isOwnEcho(event, ws)) ws.send(frameFor('care-event', event))
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
