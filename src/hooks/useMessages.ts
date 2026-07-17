import { useCallback, useEffect, useRef, useState } from 'react'
import type { RelayMessage } from '../types'

const RELAY_URL: string | undefined = import.meta.env.VITE_RELAY_URL
const RELAY_TOKEN: string | undefined = import.meta.env.VITE_RELAY_TOKEN

// Same ws(s):// -> http(s):// derivation useCareEvents/usePushSubscription
// use for their own POST endpoints.
const HTTP_RELAY_URL = RELAY_URL?.replace(/^ws/, 'http')

const RECONNECT_MIN_MS = 1_000
const RECONNECT_MAX_MS = 30_000
const OUTBOX_KEY = 'catmagochi-message-outbox-v1'

interface OutboxEntry {
  id: string
  text: string
  kind?: RelayMessage['kind']
}

function loadOutbox(): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY)
    return raw ? (JSON.parse(raw) as OutboxEntry[]) : []
  } catch {
    return []
  }
}

function saveOutbox(entries: OutboxEntry[]) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(entries))
}

export type SendStatus = 'sent' | 'queued' | 'unconfigured'

export function useMessages() {
  const [messages, setMessages] = useState<RelayMessage[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectDelay = useRef(RECONNECT_MIN_MS)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const outbox = useRef<OutboxEntry[]>(HTTP_RELAY_URL && RELAY_TOKEN ? loadOutbox() : [])
  const flushing = useRef(false)

  // Attempts one outbox entry. On success, removes it from the outbox and
  // returns true; on failure, leaves it queued (the caller decides what
  // that means -- an immediate "queued" result for send(), or "try the
  // next one later" for flush()) and returns false.
  const sendEntry = useCallback(async (entry: OutboxEntry): Promise<boolean> => {
    try {
      const res = await fetch(`${HTTP_RELAY_URL}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: RELAY_TOKEN, id: entry.id, text: entry.text, kind: entry.kind }),
      })
      if (!res.ok) return false
      outbox.current = outbox.current.filter((e) => e.id !== entry.id)
      saveOutbox(outbox.current)
      return true
    } catch {
      return false
    }
  }, [])

  // Retries whatever's left in the outbox, in order, stopping at the first
  // failure (the rest stay queued for the next opportunity) -- same shape
  // as useCareEvents.ts's own flush().
  const flush = useCallback(() => {
    if (!HTTP_RELAY_URL || !RELAY_TOKEN || flushing.current || outbox.current.length === 0) return
    flushing.current = true

    const run = async () => {
      while (outbox.current.length > 0) {
        const ok = await sendEntry(outbox.current[0])
        if (!ok) break
      }
      flushing.current = false
    }

    run()
  }, [sendEntry])

  useEffect(() => {
    if (!RELAY_URL || !RELAY_TOKEN) return

    let stopped = false

    const connect = () => {
      const ws = new WebSocket(`${RELAY_URL}/ws?token=${encodeURIComponent(RELAY_TOKEN)}`)
      wsRef.current = ws

      ws.onopen = () => {
        reconnectDelay.current = RECONNECT_MIN_MS
        flush()
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'message') {
            const { id, text, sentAt, kind } = data
            setMessages((current) =>
              current.some((m) => m.id === id) ? current : [...current, { id, text, sentAt, kind }],
            )
          }
        } catch {
          // ignore malformed frames
        }
      }

      const scheduleReconnect = () => {
        if (stopped) return
        reconnectTimer.current = setTimeout(connect, reconnectDelay.current)
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, RECONNECT_MAX_MS)
      }

      ws.onclose = scheduleReconnect
      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      stopped = true
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [flush])

  const dismiss = useCallback((id: string) => {
    setMessages((current) => current.filter((m) => m.id !== id))
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'ack', id }))
    }
  }, [])

  // Queues first (so nothing is lost even if the caller never awaits this,
  // or the component unmounts mid-request), then makes one immediate
  // attempt and resolves based on *that* attempt specifically -- it does
  // not wait around for a later background retry to eventually succeed.
  //
  // Deliberately calls sendEntry() directly rather than going through
  // flush()'s flushing-guarded loop: routing through flush() would mean a
  // send() that lands while a flush() happens to already be running just
  // returns without ever attempting anything. The accepted tradeoff is a
  // narrow, self-correcting race -- a send() and a reconnect-triggered
  // flush() can, in principle, both attempt the same freshly-queued entry
  // at once. If both succeed, the relay gets one duplicate POST for that
  // id, but the receiving device's own id-based dedup (see the onmessage
  // handler above) means the recipient only ever sees the message once;
  // the worst realistic outcome is send() resolving to 'queued' for a
  // message that, in fact, already went out via the other path. Judged not
  // worth the added complexity of a shared lock for a personal-scale relay
  // that isn't a delivery guarantee system to begin with.
  const send = useCallback(
    async (text: string, kind?: RelayMessage['kind']): Promise<SendStatus> => {
      if (!HTTP_RELAY_URL || !RELAY_TOKEN) return 'unconfigured'
      const entry: OutboxEntry = { id: crypto.randomUUID(), text, kind }
      outbox.current = [...outbox.current, entry]
      saveOutbox(outbox.current)
      const ok = await sendEntry(entry)
      return ok ? 'sent' : 'queued'
    },
    [sendEntry],
  )

  return { messages, dismiss, send }
}
