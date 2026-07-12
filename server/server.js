import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { WebSocketServer } from 'ws'

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080
const RELAY_TOKEN = process.env.RELAY_TOKEN
const MESSAGES_FILE = process.env.DATA_DIR
  ? new URL(`file://${process.env.DATA_DIR.replace(/\/$/, '')}/messages.json`)
  : new URL('./messages.json', import.meta.url)
const MAX_TEXT_LENGTH = 500
const PING_INTERVAL_MS = 25_000

if (!RELAY_TOKEN) {
  console.error('RELAY_TOKEN env var is required')
  process.exit(1)
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
        const { token, text } = JSON.parse(body)
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
        const message = { id: randomUUID(), text: trimmed, sentAt: Date.now() }
        pending.push(message)
        persist()
        broadcast(message)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, id: message.id }))
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid request' }))
      }
    })
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

  ws.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString())
      if (parsed.type === 'ack' && parsed.id) {
        pending = pending.filter((m) => m.id !== parsed.id)
        persist()
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
