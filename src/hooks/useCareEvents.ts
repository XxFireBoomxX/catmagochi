import { useCallback, useEffect, useRef } from 'react'
import type { CareEventType } from '../types'

const RELAY_URL: string | undefined = import.meta.env.VITE_RELAY_URL
const RELAY_TOKEN: string | undefined = import.meta.env.VITE_RELAY_TOKEN

// Same ws(s):// -> http(s):// derivation usePushSubscription uses for its
// own POST endpoints -- one env var covers both schemes.
const HTTP_RELAY_URL = RELAY_URL?.replace(/^ws/, 'http')

const RECONNECT_MIN_MS = 1_000
const RECONNECT_MAX_MS = 30_000
const OUTBOX_KEY = 'catmagochi-care-outbox-v1'

const CARE_EVENT_TYPES = new Set<CareEventType>(['feed', 'clean', 'pet', 'play'])

interface OutboxEntry {
  id: string
  type: CareEventType
  hits?: number
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

export type CareEventHandler = (id: string, type: CareEventType, hits?: number) => void

// Mirrors useMessages' reconnect/backoff shape, but for the care-event sync
// used by the shared-pet feature -- deliberately a separate WebSocket
// connection rather than sharing useMessages' one, since merging them would
// still need to filter frame types on both sides anyway.
//
// Unlike messages (user-visible, dismissed by tapping), incoming care
// events are silent and applied immediately via onEvent, then acked --
// there's no queue for the UI to hold or a person to act on.
//
// Outgoing events go through a small localStorage-backed outbox instead of
// a bare fire-and-forget POST: the whole point of an event log is that
// actions taken while offline aren't lost, so a failed/impossible send at
// emit time has to be retried once connectivity actually returns, not
// dropped. Flushing is opportunistic -- tried right away in emit(), and
// again whenever the WebSocket reconnects -- reusing that connection's own
// backoff pacing rather than adding a second retry timer.
export function useCareEvents(onEvent: CareEventHandler) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectDelay = useRef(RECONNECT_MIN_MS)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent
  const outbox = useRef<OutboxEntry[]>(HTTP_RELAY_URL && RELAY_TOKEN ? loadOutbox() : [])
  const flushing = useRef(false)

  const flush = useCallback(() => {
    if (!HTTP_RELAY_URL || !RELAY_TOKEN || flushing.current || outbox.current.length === 0) return
    flushing.current = true

    const sendNext = async () => {
      while (outbox.current.length > 0) {
        const next = outbox.current[0]
        try {
          const res = await fetch(`${HTTP_RELAY_URL}/care-event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: RELAY_TOKEN, id: next.id, type: next.type, hits: next.hits }),
          })
          if (!res.ok) break
          outbox.current = outbox.current.slice(1)
          saveOutbox(outbox.current)
        } catch {
          break // offline or unreachable -- leave it queued, retry on reconnect
        }
      }
      flushing.current = false
    }

    sendNext()
  }, [])

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
          if (data.type === 'care-event' && CARE_EVENT_TYPES.has(data.eventType)) {
            onEventRef.current(data.id, data.eventType, data.hits)
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ack', id: data.id }))
            }
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

  const emit = useCallback(
    (id: string, type: CareEventType, hits?: number) => {
      if (!HTTP_RELAY_URL || !RELAY_TOKEN) return
      outbox.current = [...outbox.current, { id, type, hits }]
      saveOutbox(outbox.current)
      flush()
    },
    [flush],
  )

  return { emit }
}
