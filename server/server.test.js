import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import webpush from 'web-push'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = 19081
const TOKEN = 'test-relay-token'
const BASE = `http://localhost:${PORT}`

async function waitForServer(url, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(`server at ${url} did not start in time`)
}

describe('catmagochi relay server', () => {
  let child
  let dataDir

  before(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'catmagochi-relay-test-'))
    child = spawn(process.execPath, ['server.js'], {
      cwd: __dirname,
      env: { ...process.env, PORT: String(PORT), RELAY_TOKEN: TOKEN, DATA_DIR: dataDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    await waitForServer(BASE)
  })

  after(() => {
    child.kill()
    rmSync(dataDir, { recursive: true, force: true })
  })

  test('GET / reports the server is running', async () => {
    const res = await fetch(BASE)
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'catmagochi relay running')
  })

  test('OPTIONS gets a 204 with CORS headers', async () => {
    const res = await fetch(`${BASE}/send`, { method: 'OPTIONS' })
    assert.equal(res.status, 204)
    assert.equal(res.headers.get('access-control-allow-origin'), '*')
    assert.equal(res.headers.get('access-control-allow-methods'), 'POST, OPTIONS')
  })

  test('POST /send rejects an invalid token', async () => {
    const res = await fetch(`${BASE}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'wrong', text: 'hi' }),
    })
    assert.equal(res.status, 401)
    const body = await res.json()
    assert.equal(body.error, 'invalid token')
  })

  test('POST /send rejects empty text', async () => {
    const res = await fetch(`${BASE}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, text: '   ' }),
    })
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.error, 'text is required')
  })

  test('POST /send rejects malformed JSON', async () => {
    const res = await fetch(`${BASE}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json{{',
    })
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.error, 'invalid request')
  })

  test('POST /send with a valid token queues and persists the message', async () => {
    const res = await fetch(`${BASE}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, text: 'hello there' }),
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.ok, true)
    assert.ok(body.id)

    const persisted = JSON.parse(readFileSync(join(dataDir, 'messages.json'), 'utf-8'))
    assert.ok(persisted.some((m) => m.id === body.id && m.text === 'hello there'))

    // clean up so later tests see a known pending-queue state
    await ackMessage(body.id)
  })

  test('POST /send trims text to the 500 character max', async () => {
    const longText = 'x'.repeat(600)
    const res = await fetch(`${BASE}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, text: longText }),
    })
    const body = await res.json()
    const persisted = JSON.parse(readFileSync(join(dataDir, 'messages.json'), 'utf-8'))
    const stored = persisted.find((m) => m.id === body.id)
    assert.equal(stored.text.length, 500)
    await ackMessage(body.id)
  })

  test('WS upgrade is rejected with the wrong token', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws?token=wrong`)
    const result = await new Promise((resolve) => {
      ws.onopen = () => resolve('open')
      ws.onerror = () => resolve('error')
      ws.onclose = () => resolve('closed')
    })
    assert.notEqual(result, 'open')
  })

  test('WS upgrade is rejected at the wrong path', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/not-ws?token=${TOKEN}`)
    const result = await new Promise((resolve) => {
      ws.onopen = () => resolve('open')
      ws.onerror = () => resolve('error')
      ws.onclose = () => resolve('closed')
    })
    assert.notEqual(result, 'open')
  })

  test('WS connect with a valid token succeeds, receives broadcasts, and acking removes the message', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws?token=${TOKEN}`)
    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })

    const received = new Promise((resolve) => {
      ws.onmessage = (event) => resolve(JSON.parse(event.data))
    })

    const sendRes = await fetch(`${BASE}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, text: 'live broadcast' }),
    })
    const { id } = await sendRes.json()

    const frame = await received
    assert.equal(frame.type, 'message')
    assert.equal(frame.text, 'live broadcast')
    assert.equal(frame.id, id)

    // still pending until acked
    let persisted = JSON.parse(readFileSync(join(dataDir, 'messages.json'), 'utf-8'))
    assert.ok(persisted.some((m) => m.id === id))

    ws.send(JSON.stringify({ type: 'ack', id }))
    await new Promise((r) => setTimeout(r, 100))

    persisted = JSON.parse(readFileSync(join(dataDir, 'messages.json'), 'utf-8'))
    assert.ok(!persisted.some((m) => m.id === id))

    ws.close()
  })

  test('a malformed WS frame from the client is ignored without crashing the connection', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws?token=${TOKEN}`)
    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })
    ws.send('not json{{')
    // server should still be responsive afterward
    await new Promise((r) => setTimeout(r, 50))
    const res = await fetch(BASE)
    assert.equal(res.status, 200)
    ws.close()
  })

  test('undelivered messages replay to a newly connecting client', async () => {
    const sendRes = await fetch(`${BASE}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, text: 'queued while offline' }),
    })
    const { id } = await sendRes.json()

    const ws = new WebSocket(`ws://localhost:${PORT}/ws?token=${TOKEN}`)
    const frame = await new Promise((resolve, reject) => {
      ws.onmessage = (event) => resolve(JSON.parse(event.data))
      ws.onerror = reject
    })
    assert.equal(frame.id, id)
    assert.equal(frame.text, 'queued while offline')

    ws.send(JSON.stringify({ type: 'ack', id }))
    await new Promise((r) => setTimeout(r, 100))
    ws.close()
  })

  async function ackMessage(id) {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws?token=${TOKEN}`)
    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })
    ws.send(JSON.stringify({ type: 'ack', id }))
    await new Promise((r) => setTimeout(r, 100))
    ws.close()
  }

  test('POST /care-event rejects an invalid token', async () => {
    const res = await fetch(`${BASE}/care-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'wrong', id: 'evt-1', type: 'feed' }),
    })
    assert.equal(res.status, 401)
  })

  test('POST /care-event rejects a missing id', async () => {
    const res = await fetch(`${BASE}/care-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, type: 'feed' }),
    })
    assert.equal(res.status, 400)
  })

  test('POST /care-event rejects an unrecognized event type', async () => {
    const res = await fetch(`${BASE}/care-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, id: 'evt-1', type: 'not-a-real-type' }),
    })
    assert.equal(res.status, 400)
  })

  test('POST /care-event rejects malformed JSON', async () => {
    const res = await fetch(`${BASE}/care-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json{{',
    })
    assert.equal(res.status, 400)
  })

  test('a valid care event is queued, persisted, and broadcast live to a connected client', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws?token=${TOKEN}`)
    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })
    const received = new Promise((resolve) => {
      ws.onmessage = (event) => resolve(JSON.parse(event.data))
    })

    const res = await fetch(`${BASE}/care-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, id: 'evt-live', type: 'play', hits: 3 }),
    })
    assert.equal(res.status, 200)

    const frame = await received
    assert.equal(frame.type, 'care-event')
    assert.equal(frame.id, 'evt-live')
    assert.equal(frame.eventType, 'play')
    assert.equal(frame.hits, 3)

    const stored = JSON.parse(readFileSync(join(dataDir, 'care-events.json'), 'utf-8'))
    assert.ok(stored.some((e) => e.id === 'evt-live'))

    ws.send(JSON.stringify({ type: 'ack', id: 'evt-live' }))
    await new Promise((r) => setTimeout(r, 100))
    ws.close()

    const afterAck = JSON.parse(readFileSync(join(dataDir, 'care-events.json'), 'utf-8'))
    assert.ok(!afterAck.some((e) => e.id === 'evt-live'))
  })

  test('undelivered care events replay to a newly connecting client', async () => {
    await fetch(`${BASE}/care-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, id: 'evt-queued', type: 'clean' }),
    })

    const ws = new WebSocket(`ws://localhost:${PORT}/ws?token=${TOKEN}`)
    const frame = await new Promise((resolve, reject) => {
      ws.onmessage = (event) => resolve(JSON.parse(event.data))
      ws.onerror = reject
    })
    assert.equal(frame.id, 'evt-queued')
    assert.equal(frame.eventType, 'clean')

    ws.send(JSON.stringify({ type: 'ack', id: 'evt-queued' }))
    await new Promise((r) => setTimeout(r, 100))
    ws.close()
  })

  test('a broadcast care event reaches every connected client, not just the sender', async () => {
    const wsA = new WebSocket(`ws://localhost:${PORT}/ws?token=${TOKEN}`)
    const wsB = new WebSocket(`ws://localhost:${PORT}/ws?token=${TOKEN}`)
    await Promise.all([
      new Promise((resolve, reject) => { wsA.onopen = resolve; wsA.onerror = reject }),
      new Promise((resolve, reject) => { wsB.onopen = resolve; wsB.onerror = reject }),
    ])

    const receivedByA = new Promise((resolve) => { wsA.onmessage = (e) => resolve(JSON.parse(e.data)) })
    const receivedByB = new Promise((resolve) => { wsB.onmessage = (e) => resolve(JSON.parse(e.data)) })

    await fetch(`${BASE}/care-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, id: 'evt-two-clients', type: 'pet' }),
    })

    const [frameA, frameB] = await Promise.all([receivedByA, receivedByB])
    assert.equal(frameA.id, 'evt-two-clients')
    assert.equal(frameB.id, 'evt-two-clients')

    wsA.send(JSON.stringify({ type: 'ack', id: 'evt-two-clients' }))
    await new Promise((r) => setTimeout(r, 100))
    wsA.close()
    wsB.close()
  })

  const fakeSubscription = {
    endpoint: 'https://push.example.test/fake-endpoint',
    keys: { p256dh: 'fake-p256dh', auth: 'fake-auth' },
  }

  test('POST /push/subscribe rejects an invalid token', async () => {
    const res = await fetch(`${BASE}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'wrong', subscription: fakeSubscription, types: {} }),
    })
    assert.equal(res.status, 401)
  })

  test('POST /push/subscribe rejects a malformed subscription', async () => {
    const res = await fetch(`${BASE}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, subscription: { endpoint: 'x' }, types: {} }),
    })
    assert.equal(res.status, 400)
  })

  test('POST /push/subscribe stores a subscription, reporting pushEnabled: false without VAPID keys configured', async () => {
    const res = await fetch(`${BASE}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, subscription: fakeSubscription, types: { message: true } }),
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.ok, true)
    assert.equal(body.pushEnabled, false)

    const stored = JSON.parse(readFileSync(join(dataDir, 'subscriptions.json'), 'utf-8'))
    assert.ok(stored.some((s) => s.subscription.endpoint === fakeSubscription.endpoint))
  })

  test('POST /push/subscribe with the same endpoint again replaces rather than duplicates', async () => {
    await fetch(`${BASE}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, subscription: fakeSubscription, types: { message: true } }),
    })
    await fetch(`${BASE}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, subscription: fakeSubscription, types: { message: false } }),
    })
    const stored = JSON.parse(readFileSync(join(dataDir, 'subscriptions.json'), 'utf-8'))
    const matches = stored.filter((s) => s.subscription.endpoint === fakeSubscription.endpoint)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].types.message, false)
  })

  test('POST /push/unsubscribe rejects an invalid token', async () => {
    const res = await fetch(`${BASE}/push/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'wrong', endpoint: fakeSubscription.endpoint }),
    })
    assert.equal(res.status, 401)
  })

  test('POST /push/unsubscribe removes a stored subscription', async () => {
    await fetch(`${BASE}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, subscription: fakeSubscription, types: {} }),
    })
    const res = await fetch(`${BASE}/push/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, endpoint: fakeSubscription.endpoint }),
    })
    assert.equal(res.status, 200)
    const stored = JSON.parse(readFileSync(join(dataDir, 'subscriptions.json'), 'utf-8'))
    assert.ok(!stored.some((s) => s.subscription.endpoint === fakeSubscription.endpoint))
  })

  test('POST /push/notify-update rejects an invalid token', async () => {
    const res = await fetch(`${BASE}/push/notify-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'wrong', version: '1.2.3' }),
    })
    assert.equal(res.status, 401)
  })

  test('POST /push/notify-update succeeds as a no-op without VAPID keys configured', async () => {
    const res = await fetch(`${BASE}/push/notify-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, version: '1.2.3' }),
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.ok, true)
  })
})

describe('catmagochi relay server with push enabled', () => {
  const PUSH_PORT = 19083
  const PUSH_BASE = `http://localhost:${PUSH_PORT}`
  let child
  let dataDir

  before(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'catmagochi-relay-push-test-'))
    // Generated fresh per test run, never committed -- a hardcoded keypair
    // here would be a real (if low-stakes) credential sitting in git history.
    const vapidKeys = webpush.generateVAPIDKeys()
    child = spawn(process.execPath, ['server.js'], {
      cwd: __dirname,
      env: {
        ...process.env,
        PORT: String(PUSH_PORT),
        RELAY_TOKEN: TOKEN,
        DATA_DIR: dataDir,
        VAPID_PUBLIC_KEY: vapidKeys.publicKey,
        VAPID_PRIVATE_KEY: vapidKeys.privateKey,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    await waitForServer(PUSH_BASE)
  })

  after(() => {
    child.kill()
    rmSync(dataDir, { recursive: true, force: true })
  })

  test('reports pushEnabled: true once VAPID keys are configured', async () => {
    const res = await fetch(`${PUSH_BASE}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: TOKEN,
        subscription: {
          endpoint: 'https://push.example.test/does-not-exist',
          keys: { p256dh: 'fake-p256dh', auth: 'fake-auth' },
        },
        types: { message: true },
      }),
    })
    const body = await res.json()
    assert.equal(body.pushEnabled, true)
  })

  test('a subscription pointing nowhere real does not crash /send (delivery failure is caught, not thrown)', async () => {
    const res = await fetch(`${PUSH_BASE}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, text: 'hello with a subscriber present' }),
    })
    assert.equal(res.status, 200)
    // server should still be responsive right after
    const health = await fetch(PUSH_BASE)
    assert.equal(health.status, 200)
  })
})

describe('catmagochi relay server startup', () => {
  test('exits with an error when RELAY_TOKEN is not set', async () => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: __dirname,
      env: { ...process.env, PORT: '19082', RELAY_TOKEN: '' },
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    const [code] = await new Promise((resolve) => {
      child.on('exit', (exitCode) => resolve([exitCode]))
    })
    assert.equal(code, 1)
  })
})
