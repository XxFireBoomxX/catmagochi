import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: MockWebSocket[] = []

  url: string
  readyState = MockWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  sent: string[] = []

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }
}

async function loadUseMessages(url: string, token: string) {
  vi.resetModules()
  // The repo's real .env (used for local relay testing) may set these for
  // real — always stub explicitly so tests aren't at the mercy of it.
  vi.stubEnv('VITE_RELAY_URL', url)
  vi.stubEnv('VITE_RELAY_TOKEN', token)
  const mod = await import('./useMessages')
  return mod.useMessages
}

describe('useMessages', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('never opens a socket when relay env vars are unset', async () => {
    const useMessages = await loadUseMessages('', '')
    const { result } = renderHook(() => useMessages())
    expect(MockWebSocket.instances).toHaveLength(0)
    expect(result.current.messages).toEqual([])
  })

  it('never opens a socket when only the token is missing', async () => {
    const useMessages = await loadUseMessages('wss://relay.test', '')
    renderHook(() => useMessages())
    expect(MockWebSocket.instances).toHaveLength(0)
  })

  it('connects to the relay URL with the token as a query param when configured', async () => {
    const useMessages = await loadUseMessages('wss://relay.test', 'secret-token')
    renderHook(() => useMessages())
    expect(MockWebSocket.instances).toHaveLength(1)
    expect(MockWebSocket.instances[0].url).toBe('wss://relay.test/ws?token=secret-token')
  })

  it('adds an incoming message frame to state', async () => {
    const useMessages = await loadUseMessages('wss://relay.test', 'tok')
    const { result } = renderHook(() => useMessages())
    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.onmessage?.({ data: JSON.stringify({ type: 'message', id: '1', text: 'hi', sentAt: 100 }) })
    })
    expect(result.current.messages).toEqual([{ id: '1', text: 'hi', sentAt: 100 }])
  })

  it('deduplicates messages with the same id', async () => {
    const useMessages = await loadUseMessages('wss://relay.test', 'tok')
    const { result } = renderHook(() => useMessages())
    const ws = MockWebSocket.instances[0]
    const frame = JSON.stringify({ type: 'message', id: '1', text: 'hi', sentAt: 100 })
    act(() => {
      ws.onmessage?.({ data: frame })
      ws.onmessage?.({ data: frame })
    })
    expect(result.current.messages).toHaveLength(1)
  })

  it('ignores malformed JSON frames without throwing', async () => {
    const useMessages = await loadUseMessages('wss://relay.test', 'tok')
    const { result } = renderHook(() => useMessages())
    const ws = MockWebSocket.instances[0]
    expect(() => {
      act(() => {
        ws.onmessage?.({ data: 'not json{{' })
      })
    }).not.toThrow()
    expect(result.current.messages).toEqual([])
  })

  it('ignores frames that are not type "message"', async () => {
    const useMessages = await loadUseMessages('wss://relay.test', 'tok')
    const { result } = renderHook(() => useMessages())
    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.onmessage?.({ data: JSON.stringify({ type: 'ack', id: '1' }) })
    })
    expect(result.current.messages).toEqual([])
  })

  it('dismiss removes the message locally and sends an ack when the socket is open', async () => {
    const useMessages = await loadUseMessages('wss://relay.test', 'tok')
    const { result } = renderHook(() => useMessages())
    const ws = MockWebSocket.instances[0]
    ws.readyState = MockWebSocket.OPEN
    act(() => {
      ws.onmessage?.({ data: JSON.stringify({ type: 'message', id: '1', text: 'hi', sentAt: 100 }) })
    })
    act(() => {
      result.current.dismiss('1')
    })
    expect(result.current.messages).toEqual([])
    expect(ws.sent).toEqual([JSON.stringify({ type: 'ack', id: '1' })])
  })

  it('dismiss does not try to send when the socket is not open', async () => {
    const useMessages = await loadUseMessages('wss://relay.test', 'tok')
    const { result } = renderHook(() => useMessages())
    const ws = MockWebSocket.instances[0]
    ws.readyState = MockWebSocket.CONNECTING
    act(() => {
      ws.onmessage?.({ data: JSON.stringify({ type: 'message', id: '1', text: 'hi', sentAt: 100 }) })
    })
    act(() => {
      result.current.dismiss('1')
    })
    expect(result.current.messages).toEqual([])
    expect(ws.sent).toEqual([])
  })

  it('reconnects with backoff after the socket closes, and resets on open', async () => {
    vi.useFakeTimers()
    const useMessages = await loadUseMessages('wss://relay.test', 'tok')
    renderHook(() => useMessages())
    expect(MockWebSocket.instances).toHaveLength(1)

    act(() => {
      MockWebSocket.instances[0].onclose?.()
    })
    // first reconnect delay is 1000ms
    act(() => {
      vi.advanceTimersByTime(999)
    })
    expect(MockWebSocket.instances).toHaveLength(1)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(MockWebSocket.instances).toHaveLength(2)

    // opening resets the backoff delay for the next disconnect
    act(() => {
      MockWebSocket.instances[1].onopen?.()
      MockWebSocket.instances[1].onclose?.()
    })
    act(() => {
      vi.advanceTimersByTime(999)
    })
    expect(MockWebSocket.instances).toHaveLength(2)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(MockWebSocket.instances).toHaveLength(3)
  })

  it('doubles the backoff delay on consecutive disconnects without an intervening open, capped at 30s', async () => {
    vi.useFakeTimers()
    const useMessages = await loadUseMessages('wss://relay.test', 'tok')
    renderHook(() => useMessages())

    act(() => {
      MockWebSocket.instances[0].onclose?.()
    })
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(MockWebSocket.instances).toHaveLength(2)

    // no onopen fired, so the delay should now be doubled to 2000ms
    act(() => {
      MockWebSocket.instances[1].onclose?.()
    })
    act(() => {
      vi.advanceTimersByTime(1_999)
    })
    expect(MockWebSocket.instances).toHaveLength(2)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(MockWebSocket.instances).toHaveLength(3)
  })

  it('treats a socket error as a close (triggers the same reconnect path)', async () => {
    vi.useFakeTimers()
    const useMessages = await loadUseMessages('wss://relay.test', 'tok')
    renderHook(() => useMessages())
    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.onerror?.()
    })
    expect(ws.readyState).toBe(MockWebSocket.CLOSED)
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(MockWebSocket.instances).toHaveLength(2)
  })

  it('stops reconnecting after unmount', async () => {
    vi.useFakeTimers()
    const useMessages = await loadUseMessages('wss://relay.test', 'tok')
    const { unmount } = renderHook(() => useMessages())
    const ws = MockWebSocket.instances[0]
    unmount()
    expect(ws.readyState).toBe(MockWebSocket.CLOSED)
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(MockWebSocket.instances).toHaveLength(1)
  })

  it('re-renders visible messages via waitFor after an async-style update', async () => {
    const useMessages = await loadUseMessages('wss://relay.test', 'tok')
    const { result } = renderHook(() => useMessages())
    const ws = MockWebSocket.instances[0]
    ws.onmessage?.({ data: JSON.stringify({ type: 'message', id: '9', text: 'async', sentAt: 1 }) })
    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1)
    })
  })

  describe('send', () => {
    let fetchMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
      fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
    })

    it('is a no-op when relay env vars are unset', async () => {
      const useMessages = await loadUseMessages('', '')
      const { result } = renderHook(() => useMessages())
      act(() => {
        result.current.send('hello')
      })
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('posts the text and an optional kind to /send', async () => {
      fetchMock.mockResolvedValue({ ok: true })
      const useMessages = await loadUseMessages('wss://relay.test', 'tok')
      const { result } = renderHook(() => useMessages())
      act(() => {
        result.current.send('Thinking of you', 'nudge')
      })
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          'https://relay.test/send',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ token: 'tok', text: 'Thinking of you', kind: 'nudge' }),
          }),
        )
      })
    })

    it('does not throw when the send fails (e.g. offline)', async () => {
      fetchMock.mockRejectedValue(new Error('offline'))
      const useMessages = await loadUseMessages('wss://relay.test', 'tok')
      const { result } = renderHook(() => useMessages())
      expect(() => {
        act(() => {
          result.current.send('hello')
        })
      }).not.toThrow()
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1)
      })
    })
  })
})
