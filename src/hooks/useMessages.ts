import { useCallback, useEffect, useRef, useState } from 'react'
import type { RelayMessage } from '../types'

const RELAY_URL: string | undefined = import.meta.env.VITE_RELAY_URL
const RELAY_TOKEN: string | undefined = import.meta.env.VITE_RELAY_TOKEN

// Same ws(s):// -> http(s):// derivation useCareEvents/usePushSubscription
// use for their own POST endpoints.
const HTTP_RELAY_URL = RELAY_URL?.replace(/^ws/, 'http')

const RECONNECT_MIN_MS = 1_000
const RECONNECT_MAX_MS = 30_000

export function useMessages() {
  const [messages, setMessages] = useState<RelayMessage[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectDelay = useRef(RECONNECT_MIN_MS)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!RELAY_URL || !RELAY_TOKEN) return

    let stopped = false

    const connect = () => {
      const ws = new WebSocket(`${RELAY_URL}/ws?token=${encodeURIComponent(RELAY_TOKEN)}`)
      wsRef.current = ws

      ws.onopen = () => {
        reconnectDelay.current = RECONNECT_MIN_MS
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
  }, [])

  const dismiss = useCallback((id: string) => {
    setMessages((current) => current.filter((m) => m.id !== id))
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'ack', id }))
    }
  }, [])

  // Fire-and-forget, matching sender.html's own send behavior -- unlike
  // care events, a nudge isn't part of a replayed stat log, so there's no
  // outbox to retry it from; a send attempted while offline just fails.
  const send = useCallback((text: string, kind?: RelayMessage['kind']) => {
    if (!HTTP_RELAY_URL || !RELAY_TOKEN) return
    fetch(`${HTTP_RELAY_URL}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: RELAY_TOKEN, text, kind }),
    }).catch(() => {
      // offline/unreachable -- nothing to retry, see comment above
    })
  }, [])

  return { messages, dismiss, send }
}
